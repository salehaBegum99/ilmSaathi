import mongoose from "mongoose";
import type { AppConfig } from "../config/env.js";

export interface ReadinessProbe {
  isReady(): Promise<boolean>;
}

const delay = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

export class MongoConnectionManager implements ReadinessProbe {
  private connectionPromise: Promise<void> | null = null;
  private connected = false;

  constructor(private readonly config: AppConfig["mongo"]) {
    mongoose.set("bufferCommands", false);
    mongoose.set("autoIndex", config.autoIndex);
  }

  connect(): Promise<void> {
    if (!this.connectionPromise) {
      this.connectionPromise = this.connectWithRetry().catch((error: unknown) => {
        this.connectionPromise = null;
        throw error;
      });
    }
    return this.connectionPromise;
  }

  private async connectWithRetry(): Promise<void> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= this.config.maxAttempts; attempt += 1) {
      try {
        await mongoose.connect(this.config.uri, {
          ...(this.config.dbName ? { dbName: this.config.dbName } : {}),
          serverSelectionTimeoutMS: this.config.connectTimeoutMs,
          connectTimeoutMS: this.config.connectTimeoutMs,
          socketTimeoutMS: 30_000,
          maxPoolSize: 20,
          minPoolSize: 1,
          retryWrites: true,
          family: 4,
        });
        const database = mongoose.connection.db;
        if (!database) throw new Error("MongoDB connected without a database handle");
        const topology = await database.admin().command({ hello: 1, maxTimeMS: 2_000 });
        if (typeof topology["setName"] !== "string" && topology["msg"] !== "isdbgrid") {
          throw new Error(
            "MongoDB must be a replica set or sharded cluster because this API requires transactions",
          );
        }
        this.connected = true;
        mongoose.connection.on("disconnected", () => {
          this.connected = false;
        });
        mongoose.connection.on("connected", () => {
          this.connected = true;
        });
        return;
      } catch (error) {
        lastError = error;
        this.connected = false;
        if (mongoose.connection.readyState !== 0) {
          await mongoose.disconnect().catch(() => undefined);
        }
        if (attempt < this.config.maxAttempts) {
          const exponential = this.config.retryBaseDelayMs * 2 ** (attempt - 1);
          const jitter = Math.floor(Math.random() * this.config.retryBaseDelayMs);
          await delay(Math.min(exponential + jitter, 5_000));
        }
      }
    }
    throw new Error(
      `MongoDB connection failed after ${this.config.maxAttempts} attempts`,
      { cause: lastError },
    );
  }

  async isReady(): Promise<boolean> {
    if (!this.connected || mongoose.connection.readyState !== 1 || !mongoose.connection.db) {
      return false;
    }
    try {
      await mongoose.connection.db.admin().command({ ping: 1, maxTimeMS: 1_000 });
      return true;
    } catch {
      return false;
    }
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    this.connectionPromise = null;
    await mongoose.disconnect();
  }
}

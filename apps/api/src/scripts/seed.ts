import { loadConfig } from "../config/env.js";
import { MongoConnectionManager } from "../database/connection.js";
import { SubjectModel } from "../database/models.js";

const SUBJECTS = [
  {
    slug: "quran-nazra",
    category: "islamic",
    names: { en: "Qur'an / Nazra", hi: "क़ुरआन / नाज़रा", ur: "قرآن / ناظرہ" },
    sortOrder: 10,
  },
  {
    slug: "tajweed",
    category: "islamic",
    names: { en: "Tajweed", hi: "तजवीद", ur: "تجوید" },
    sortOrder: 20,
  },
  {
    slug: "basic-islamic-studies",
    category: "islamic",
    names: {
      en: "Basic Islamic Studies",
      hi: "बुनियादी इस्लामी अध्ययन",
      ur: "بنیادی اسلامیات",
    },
    sortOrder: 30,
  },
  {
    slug: "spoken-english",
    category: "academic",
    names: { en: "Spoken English", hi: "बोलचाल की अंग्रेज़ी", ur: "بول چال کی انگریزی" },
    sortOrder: 40,
  },
  {
    slug: "school-mathematics-science",
    category: "academic",
    names: {
      en: "School Mathematics / Science",
      hi: "स्कूली गणित / विज्ञान",
      ur: "اسکولی ریاضی / سائنس",
    },
    sortOrder: 50,
  },
  {
    slug: "computer-basics",
    category: "practical",
    names: {
      en: "Computer Basics",
      hi: "कंप्यूटर की बुनियादी बातें",
      ur: "کمپیوٹر کی بنیادی باتیں",
    },
    sortOrder: 60,
  },
] as const;

async function seed() {
  const config = loadConfig();
  if (config.env === "production" && process.env["ALLOW_PRODUCTION_SEED"] !== "true") {
    throw new Error("Production seed refused; set ALLOW_PRODUCTION_SEED=true for an intentional run");
  }
  const mongo = new MongoConnectionManager(config.mongo);
  await mongo.connect();
  try {
    const result = await SubjectModel.bulkWrite(
      SUBJECTS.map((subject) => ({
        updateOne: {
          filter: { slug: subject.slug },
          update: { $set: { ...subject, active: true } },
          upsert: true,
        },
      })),
      { ordered: true },
    );
    console.info("subject_seed_complete", {
      matched: result.matchedCount,
      modified: result.modifiedCount,
      upserted: result.upsertedCount,
    });
  } finally {
    await mongo.disconnect();
  }
}

seed().catch((error: unknown) => {
  console.error("subject_seed_failed", {
    errorName: error instanceof Error ? error.name : "UnknownError",
    message: error instanceof Error ? error.message : "Unknown seed failure",
  });
  process.exitCode = 1;
});

import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { Brand } from "./Brand";

describe("Brand", () => {
  it("renders the IlmSaathi identity and accessible logo label", () => {
    const markup = renderToStaticMarkup(
      <MemoryRouter>
        <Brand />
      </MemoryRouter>,
    );

    expect(markup).toContain("IlmSaathi");
    expect(markup).toContain('aria-label="IlmSaathi home"');
    expect(markup).toContain("learn");
    expect(markup).toContain("teach");
    expect(markup).toContain("rise");
  });
});

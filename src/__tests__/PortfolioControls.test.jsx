import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import React, { useState } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import PortfolioControls from "../components/PortfolioControls.jsx";

function Wrapper() {
  const [portfolioId, setPortfolioId] = useState("demo");
  const [portfolioKey, setPortfolioKey] = useState("");
  const [portfolioKeyNew, setPortfolioKeyNew] = useState("");

  return (
    <PortfolioControls
      portfolioId={portfolioId}
      portfolioKey={portfolioKey}
      portfolioKeyNew={portfolioKeyNew}
      onPortfolioIdChange={setPortfolioId}
      onPortfolioKeyChange={setPortfolioKey}
      onPortfolioKeyNewChange={setPortfolioKeyNew}
      onSave={async () => {}}
      onLoad={async () => {}}
    />
  );
}

describe("PortfolioControls API key guidance", () => {
  beforeEach(() => {
    const dom = new JSDOM("<!doctype html><html><body></body></html>", {
      url: "http://localhost/",
    });
    global.window = dom.window;
    global.document = dom.window.document;
    global.navigator = dom.window.navigator;
    global.HTMLElement = dom.window.HTMLElement;
    global.Node = dom.window.Node;
    global.localStorage = dom.window.localStorage;
  });

  afterEach(() => {
    cleanup();
    delete global.window;
    delete global.document;
    delete global.navigator;
    delete global.HTMLElement;
    delete global.Node;
    delete global.localStorage;
  });

  it("renders checklist feedback as the user types", async () => {
    render(<Wrapper />);

    assert.ok(
      screen.getByText("Enter a key to evaluate strength"),
    );
    assert.ok(screen.getByText("At least 12 characters"));

    const apiKeyInput = screen.getByLabelText("API Key");
    await userEvent.type(apiKeyInput, "MyPortfolio2024!Secure");

    assert.ok(screen.getByText("Strength: strong"));
  });

  it("blocks rotation when the new key is weak", async () => {
    let saveCalls = 0;
    function RotatingWrapper() {
      const [portfolioId, setPortfolioId] = useState("demo");
      const [portfolioKey, setPortfolioKey] = useState("CurrentKey2024!");
      const [portfolioKeyNew, setPortfolioKeyNew] = useState("");

      return (
        <PortfolioControls
          portfolioId={portfolioId}
          portfolioKey={portfolioKey}
          portfolioKeyNew={portfolioKeyNew}
          onPortfolioIdChange={setPortfolioId}
          onPortfolioKeyChange={setPortfolioKey}
          onPortfolioKeyNewChange={setPortfolioKeyNew}
          onSave={async () => {
            saveCalls += 1;
          }}
          onLoad={async () => {}}
        />
      );
    }

    render(<RotatingWrapper />);

    const newKeyInput = screen.getByLabelText("Rotate Key (optional)");
    await userEvent.type(newKeyInput, "weakkey");
    await userEvent.click(screen.getByRole("button", { name: "Save Portfolio" }));

    assert.equal(saveCalls, 0);
    assert.ok(
      screen.getByText("New API key does not meet strength requirements."),
    );
  });
});

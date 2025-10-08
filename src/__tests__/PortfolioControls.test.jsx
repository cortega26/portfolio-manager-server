import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import React, { useState } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";

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

  it("maps API errors to friendly copy and surfaces request IDs", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    try {
      const failingSave = vi.fn().mockRejectedValue(
        Object.assign(new Error("Forbidden"), {
          name: "ApiError",
          status: 403,
          requestId: "req-auth-403",
        }),
      );

      function ErrorWrapper() {
        const [portfolioId, setPortfolioId] = useState("demo");
        const [portfolioKey, setPortfolioKey] = useState("StrongKey2024!");

        return (
          <PortfolioControls
            portfolioId={portfolioId}
            portfolioKey={portfolioKey}
            portfolioKeyNew=""
            onPortfolioIdChange={setPortfolioId}
            onPortfolioKeyChange={setPortfolioKey}
            onPortfolioKeyNewChange={() => {}}
            onSave={failingSave}
            onLoad={async () => {}}
          />
        );
      }

      render(<ErrorWrapper />);

      await userEvent.click(
        screen.getByRole("button", { name: "Save Portfolio" }),
      );

      assert.equal(failingSave.mock.calls.length, 1);
      assert.ok(
        screen.getByText(
          "Access denied for this portfolio. Verify the API key or rotate it.",
        ),
      );
      assert.ok(
        screen.getByText(/Request ID: req-auth-403/),
      );
    } finally {
      consoleError.mockRestore();
    }
  });

  it("falls back to generic messaging for unexpected failures", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    try {
      const failingLoad = vi.fn().mockRejectedValue(
        Object.assign(new Error("Teapot"), {
          name: "ApiError",
          status: 503,
          requestId: "req-503",
        }),
      );

      function LoadWrapper() {
        const [portfolioId, setPortfolioId] = useState("demo");
        const [portfolioKey, setPortfolioKey] = useState("StrongKey2024!");

        return (
          <PortfolioControls
            portfolioId={portfolioId}
            portfolioKey={portfolioKey}
            portfolioKeyNew=""
            onPortfolioIdChange={setPortfolioId}
            onPortfolioKeyChange={setPortfolioKey}
            onPortfolioKeyNewChange={() => {}}
            onSave={async () => {}}
            onLoad={failingLoad}
          />
        );
      }

      render(<LoadWrapper />);

      await userEvent.click(
        screen.getByRole("button", { name: "Load Portfolio" }),
      );

      assert.equal(failingLoad.mock.calls.length, 1);
      assert.ok(
        screen.getByText("Server error encountered. Try again shortly."),
      );
      assert.ok(screen.getByText(/Request ID: req-503/));
    } finally {
      consoleError.mockRestore();
    }
  });
});

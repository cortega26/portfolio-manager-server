import React from "react";
import { screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import ToastStack from "../components/ToastStack.jsx";
import { renderWithProviders } from "./test-utils";

const LANGUAGE_STORAGE_KEY = "portfolio-manager-language";

describe("ToastStack", () => {
  afterEach(() => {
    window.localStorage.removeItem(LANGUAGE_STORAGE_KEY);
  });

  test("renders close button with translated aria-label", () => {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, "es");
    const handleDismiss = vi.fn();
    renderWithProviders(
      <ToastStack
        toasts={[
          {
            id: "1",
            title: "Operación completada",
            message: "Prueba",
            type: "success",
            durationMs: 0,
          },
        ]}
        onDismiss={handleDismiss}
      />,
    );

    const closeButton = screen.getByRole("button", {
      name: /descartar notificación/i,
    });
    expect(closeButton).toBeInTheDocument();
  });
});

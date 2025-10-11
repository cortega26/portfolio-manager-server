import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import App from "../App.jsx";
import { I18nProvider } from "../i18n/I18nProvider.jsx";

function renderWithProviders(initialEntries: string[]) {
  return render(
    <I18nProvider>
      <MemoryRouter initialEntries={initialEntries}>
        <App />
      </MemoryRouter>
    </I18nProvider>,
  );
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("app smoke", () => {
  it("renders the dashboard route by default", async () => {
    renderWithProviders(["/"]);

    expect(await screen.findByText(/Portfolio Manager/i)).toBeInTheDocument();
    expect(await screen.findByTestId("panel-dashboard")).toBeVisible();
  });

  it("guards admin routes when invite tokens are configured", async () => {
    vi.stubEnv("VITE_ADMIN_ACCESS_TOKENS", "alpha-token");

    renderWithProviders(["/admin/bad-token"]);

    expect(
      await screen.findByText(/This admin dashboard link is invalid or has expired/i),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Return to portfolio/i })).toBeVisible();
  });
});

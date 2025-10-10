import { afterEach, describe, expect, test, vi } from "vitest";
import { screen } from "@testing-library/react";

import App from "../App.jsx";
import { renderWithProviders } from "./test-utils";

vi.mock("../components/AdminTab.jsx", () => ({
  __esModule: true,
  default: () => <div data-testid="admin-portal-view" />,
}));

describe("admin routing", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  test("blocks access when invite tokens are missing", async () => {
    renderWithProviders(<App />, { route: "/admin" });

    expect(await screen.findByText(/Admin access not configured/i)).toBeInTheDocument();
  });

  test("blocks access for invalid tokens", async () => {
    vi.stubEnv("VITE_ADMIN_ACCESS_TOKENS", "friend-one,friend-two,friend-three");

    renderWithProviders(<App />, { route: "/admin/unknown" });

    expect(await screen.findByText(/Private admin access/i)).toBeInTheDocument();
  });

  test("renders admin portal for valid tokens", async () => {
    vi.stubEnv("VITE_ADMIN_ACCESS_TOKENS", "friend-one,friend-two,friend-three");

    renderWithProviders(<App />, { route: "/admin/friend-two" });

    expect(await screen.findByTestId("admin-portal-view")).toBeInTheDocument();
  });
});

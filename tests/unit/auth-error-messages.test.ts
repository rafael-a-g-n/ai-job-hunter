import { describe, expect, it } from "vitest";
import {
  authErrorMessage,
  signInErrorMessage,
  TOO_MANY_ATTEMPTS,
} from "@/components/auth/error-messages";

describe("auth error messages", () => {
  it("maps a 429 on sign-in to the rate-limit message", () => {
    expect(signInErrorMessage(429)).toBe("Too many attempts. Try again in a few minutes.");
  });

  it("keeps the other sign-in messages", () => {
    expect(signInErrorMessage(403)).toBe("Please verify your email before signing in.");
    expect(signInErrorMessage(401)).toBe("Invalid email or password.");
  });

  it("maps a 429 on sign-up or reset, and otherwise keeps the server message", () => {
    expect(authErrorMessage({ status: 429, message: "Too many requests." }, "x")).toBe(
      TOO_MANY_ATTEMPTS,
    );
    expect(authErrorMessage({ status: 422, message: "User already exists" }, "x")).toBe(
      "User already exists",
    );
    expect(authErrorMessage({ status: 500 }, "Could not create the account.")).toBe(
      "Could not create the account.",
    );
  });
});

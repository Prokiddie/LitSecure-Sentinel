/**
 * Test setup — runs before every test file.
 * Uses an in-memory SQLite database so tests never touch the real data file.
 */
import { vi } from "vitest";

// Silence console noise during tests
vi.spyOn(console, "log").mockImplementation(() => {});
vi.spyOn(console, "warn").mockImplementation(() => {});
vi.spyOn(console, "error").mockImplementation(() => {});

// Point DB to a temp in-memory DB for tests
process.env.NODE_ENV       = "test";
process.env.JWT_SECRET     = "test-jwt-secret-32-chars-minimum!!";
process.env.JWT_EXPIRY     = "1h";
process.env.GEMINI_API_KEY = "test-key";
process.env.DATABASE_PATH  = ":memory:";

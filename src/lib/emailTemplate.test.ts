import { expect, it } from "bun:test";
import { usesDriveLinks } from "./emailTemplate";

it("keeps normal attachments out of Google Drive mode", () => {
  expect(usesDriveLinks([{ name: "scan.pdf", size: 1024, url: null }])).toBe(false);
});

it("uses Google Drive mode when a file has a download link", () => {
  expect(
    usesDriveLinks([{ name: "scan.pdf", size: 20_000_000, url: "https://drive.example/file" }]),
  ).toBe(true);
});
import assert from "node:assert/strict";
import { it } from "node:test";
import { buildPlainText, usesDriveLinks } from "./emailTemplate";
import { getSendProgressLabel } from "./files";

const baseInput = {
  senderName: "Students Graphics",
  intro:
    "Please find the scanned document as requested.\n\nDOWNLOAD THE FILES TO YOUR DEVICE. THESE FILES WILL BE AUTOMATICALLY DELETED AFTER 3 DAYS.\nஇந்த பைல்களை உங்கள் மொபைல் அல்லது கம்ப்யூட்டரில் டவுன்லோட் செய்து வைத்துக்கொள்ளுங்கள். 3 நாட்களுக்குப் பிறகு இந்த பைல்கள் தானாகவே அழிந்துவிடும்.",
  files: [{ name: "scan.pdf", size: 1024, url: null }],
  footerSrc: null,
  attached: true,
};

it("shows the standard body without the Drive-only notice for normal attachments", () => {
  assert.equal(usesDriveLinks(baseInput.files), false);
  const body = buildPlainText(baseInput);
  assert.ok(body.includes("Please find the scanned document as requested."));
  assert.ok(!body.includes("DOWNLOAD THE FILES TO YOUR DEVICE"));
  assert.ok(!body.includes("இந்த பைல்களை"));
});

it("adds the English and Tamil three-day notice for Google Drive files", () => {
  const driveInput = {
    ...baseInput,
    files: [{ name: "scan.pdf", size: 20_000_000, url: "https://drive.example/file" }],
    attached: false,
  };
  assert.equal(usesDriveLinks(driveInput.files), true);
  const body = buildPlainText(driveInput);
  assert.ok(
    body.includes("DOWNLOAD THE FILES TO YOUR DEVICE. THESE FILES WILL BE AUTOMATICALLY DELETED AFTER 3 DAYS."),
  );
  assert.ok(
    body.includes("இந்த பைல்களை உங்கள் மொபைல் அல்லது கம்ப்யூட்டரில் டவுன்லோட் செய்து வைத்துக்கொள்ளுங்கள்"),
  );
});

it("shows Drive upload progress only for files using Google Drive", () => {
  assert.equal(getSendProgressLabel(50, 1, false), "Preparing attachments…");
  assert.equal(getSendProgressLabel(50, 2, true), "Uploading 2 files to Google Drive…");
});
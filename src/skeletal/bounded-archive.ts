// Compatibility entry point for existing skin/identity/wardrobe imports.
// Generic archive validation lives in core so the standalone player has no
// dependency on skeletal authoring modules.
export { crc32, readBoundedArchive } from "../core/bounded-archive";
export type { ArchivePolicy } from "../core/bounded-archive";

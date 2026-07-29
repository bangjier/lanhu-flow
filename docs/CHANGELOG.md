# Changelog / 更新日志

All notable changes to LanhuFlow MCP are documented here. This project follows [Semantic Versioning](https://semver.org/).

## [1.0.0] - 2026-07-29

### Added

- Established the independent LanhuFlow MCP package, CLI, repository, documentation, and runtime identity.
- Added `lanhu_design`, `lanhu_page`, and `lanhu_resolve_invite` MCP tools.
- Added selective design outputs for HTML, images, tokens, layout, layers, and slices.
- Added compact and detailed design lists, `image_id` URL selection, and configurable `layer_depth`.
- Added concurrent design analysis with retry and operation-specific errors.
- Added structured Design Tokens across Schema, artboard, board, and legacy `info[]` Sketch formats.
- Added MCP resources and prompts for design discovery, frontend development, and design review.

### Changed

- Standardized tool responses on camelCase fields including `projectName`, `totalDesigns`, `designs`, `designId`, `status`, `dimensions`, `outputs`, and `errors`.
- Unified standalone token and slice results with their corresponding `analyze` outputs.
- Defined `dimensions.analysis` as the normalized development coordinate space while preserving image pixel dimensions separately.
- Made design output operations independent so partial failures return `partial_success` with specific errors.

### Fixed

- Return every match for duplicate design names instead of silently selecting the first artboard.
- Accept design names, UUIDs, numeric indexes, and numeric-string indexes with bounded suggestions for missing targets.
- Recover layout, layer annotations, HTML, tokens, and slices from legacy Sketch data.
- Merge equivalent RGBA colors and exclude invalid typography values.
- Normalize Sketch, Schema, slice, and image dimensions without mixing logical coordinates and image pixels.
- Preserve available Sketch or Schema token data when the other source fails.

[1.0.0]: https://github.com/bangjier/lanhu-flow/releases/tag/v1.0.0

# ADR 0001: Target-page overlay for MVP

Status: accepted for MVP

## Context

The local React renderer cannot draw above a separate `WebContentsView`. MarkFix needs annotations to remain visually attached to the website while keeping the website isolated from privileged APIs.

## Decision

Use a sandboxed target preload to create a fixed, closed Shadow DOM containing an SVG overlay. The main process owns annotation state and sends only validated display commands. User-originated selections are accepted only from trusted pointer events and a verified target `WebContents` sender.

CDP `Overlay.setInspectMode` remains the primary DOM hit-testing path. Pages where CDP inspection fails automatically enter region-selection mode.

## Consequences

- The website receives no Node or generic IPC bridge.
- Canvas, WebGL, PDF, protected pages, and unsupported frames use visual region anchors.
- The compatibility suite must measure hostile DOM removal and OOPIF behavior before this decision is promoted from MVP to V1.

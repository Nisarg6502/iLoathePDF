import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { CameraCapture } from "./CameraCapture";

describe("CameraCapture", () => {
  beforeEach(() => {
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia: vi.fn().mockRejectedValue(new Error("Permission denied")) },
    });
  });

  it("shows a graceful error message when the camera can't be accessed", async () => {
    render(<CameraCapture onDone={vi.fn()} onClose={vi.fn()} />);
    expect(await screen.findByText(/couldn't access the camera/i)).toBeInTheDocument();
  });

  it("does not render a Capture button while the camera failed to start", async () => {
    render(<CameraCapture onDone={vi.fn()} onClose={vi.fn()} />);
    await screen.findByText(/couldn't access the camera/i);
    expect(screen.queryByRole("button", { name: /^capture$/i })).not.toBeInTheDocument();
  });
});

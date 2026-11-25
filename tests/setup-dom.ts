import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// jsdom has no layout, no <dialog> modality and no scrollIntoView. These stand-ins keep the semantics the
// components rely on: showModal marks the dialog open, close removes it and fires "close".
if (typeof HTMLDialogElement !== "undefined") {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    this.removeAttribute("open");
    this.dispatchEvent(new Event("close"));
  };
}
Element.prototype.scrollIntoView = function scrollIntoView() {};

afterEach(() => {
  cleanup();
});

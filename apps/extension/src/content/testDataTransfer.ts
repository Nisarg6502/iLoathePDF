/**
 * Test-only: jsdom has no DataTransfer, and its FileList can't be built from
 * outside. This stand-in fills a real jsdom FileList through jsdom's internal
 * wrapper/impl bridge, so `input.files = transfer.files` goes through jsdom's
 * own setter exactly as the browser's would.
 */
// @ts-expect-error - jsdom ships no types for its generated internals
import idlUtils from "jsdom/lib/generated/idl/utils.js";

const utils = idlUtils as { implForWrapper(wrapper: unknown): unknown };

export class TestDataTransfer {
  #files: File[] = [];
  readonly items = { add: (file: File) => void this.#files.push(file) };
  get files(): FileList {
    const holder = document.createElement("input");
    holder.type = "file";
    const list = holder.files!;
    const impl = utils.implForWrapper(list) as unknown[];
    for (const file of this.#files) impl.push(utils.implForWrapper(file));
    return list;
  }
}

export function installDataTransfer(): void {
  (globalThis as unknown as { DataTransfer: unknown }).DataTransfer = TestDataTransfer;
}

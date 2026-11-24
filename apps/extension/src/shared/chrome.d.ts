/**
 * The few extension APIs this extension uses, typed by hand so the project
 * doesn't need another dependency (@types/chrome). Promise-returning forms
 * only: Chrome and Firefox both support them under Manifest V3.
 */
declare namespace chrome {
  namespace runtime {
    const id: string;
    function getURL(path: string): string;
    function sendMessage<T = unknown>(message: unknown): Promise<T>;
    interface MessageSender {
      tab?: tabs.Tab;
      frameId?: number;
      id?: string;
      url?: string;
    }
    const onMessage: {
      addListener(
        callback: (message: unknown, sender: MessageSender, sendResponse: (response?: unknown) => void) => boolean | void,
      ): void;
    };
    const onInstalled: { addListener(callback: () => void): void };
    const onStartup: { addListener(callback: () => void): void };
  }

  namespace tabs {
    interface Tab {
      id?: number;
      url?: string;
      title?: string;
      windowId: number;
    }
    function query(query: { active?: boolean; currentWindow?: boolean }): Promise<Tab[]>;
    function sendMessage<T = unknown>(tabId: number, message: unknown, options?: { frameId?: number }): Promise<T>;
  }

  namespace scripting {
    interface InjectionTarget {
      tabId: number;
      frameIds?: number[];
      allFrames?: boolean;
    }
    interface InjectionResult<T> {
      frameId: number;
      result?: T;
    }
    function executeScript<Args extends unknown[], T>(injection: {
      target: InjectionTarget;
      files?: string[];
      func?: (...args: Args) => T | Promise<T>;
      args?: Args;
    }): Promise<InjectionResult<Awaited<T>>[]>;
    interface RegisteredContentScript {
      id: string;
      matches?: string[];
      js?: string[];
      allFrames?: boolean;
      runAt?: "document_start" | "document_end" | "document_idle";
      persistAcrossSessions?: boolean;
    }
    function registerContentScripts(scripts: RegisteredContentScript[]): Promise<void>;
    function unregisterContentScripts(filter?: { ids?: string[] }): Promise<void>;
    function getRegisteredContentScripts(filter?: { ids?: string[] }): Promise<RegisteredContentScript[]>;
  }

  namespace contextMenus {
    type ContextType = "all" | "page" | "frame" | "selection" | "link" | "editable" | "image" | "video" | "audio";
    interface OnClickData {
      menuItemId: string | number;
      srcUrl?: string;
      pageUrl?: string;
      frameUrl?: string;
      frameId?: number;
      mediaType?: string;
    }
    function create(props: { id: string; title: string; contexts: ContextType[] }, callback?: () => void): void;
    function removeAll(): Promise<void>;
    const onClicked: { addListener(callback: (info: OnClickData, tab?: tabs.Tab) => void): void };
  }

  namespace permissions {
    interface Permissions {
      origins?: string[];
      permissions?: string[];
    }
    function request(permissions: Permissions): Promise<boolean>;
    function contains(permissions: Permissions): Promise<boolean>;
    function remove(permissions: Permissions): Promise<boolean>;
    function getAll(): Promise<Permissions>;
  }

  namespace action {
    function setBadgeText(details: { text: string }): Promise<void>;
    function setBadgeBackgroundColor(details: { color: string }): Promise<void>;
  }

  namespace i18n {
    function getMessage(name: string, substitutions?: string | string[]): string;
    function getUILanguage(): string;
  }
}

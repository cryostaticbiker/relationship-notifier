declare module "@vendetta/plugin" {
  export const storage: Record<string, unknown>;
}

declare module "@vendetta/metro" {
  export function findByProps(...props: string[]): any;
  export function findByStoreName(name: string): any;
}

declare module "@vendetta/metro/common" {
  export const FluxDispatcher: {
    subscribe?: (event: string, callback: (event: any) => void) => void;
    unsubscribe?: (event: string, callback: (event: any) => void) => void;
    dispatch?: (event: Record<string, unknown>) => void;
  };
  export const ReactNative: any;
}

declare module "@vendetta/ui/toasts" {
  export function showToast(message: string, asset?: number | string): void;
}

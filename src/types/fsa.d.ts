export interface FileSystemPermissionDescriptor {
  mode?: 'read' | 'readwrite';
}

export interface FinPulseFileSystemHandle {
  readonly kind: 'file' | 'directory';
  readonly name: string;
  queryPermission?: (descriptor?: FileSystemPermissionDescriptor) => Promise<PermissionState>;
  requestPermission?: (descriptor?: FileSystemPermissionDescriptor) => Promise<PermissionState>;
}

export interface FinPulseFileSystemFileHandle extends FinPulseFileSystemHandle {
  readonly kind: 'file';
  getFile: () => Promise<File>;
}

export interface OpenFilePickerOptions {
  multiple?: boolean;
  excludeAcceptAllOption?: boolean;
  types?: Array<{
    description?: string;
    accept: Record<string, string[]>;
  }>;
}

declare global {
  interface Window {
    showOpenFilePicker?: (
      options?: OpenFilePickerOptions,
    ) => Promise<FinPulseFileSystemFileHandle[]>;
  }

  interface DataTransferItem {
    getAsFileSystemHandle?: () => Promise<FinPulseFileSystemHandle | null>;
  }
}

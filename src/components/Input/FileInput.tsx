import { InstanceDataType, IData } from "@/lib/types";
import {
  forwardRef,
  HTMLAttributes,
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { BaseInput } from "./BaseInput";
import {
  saveFileAsset,
  deleteFileAsset,
  getFileAsset,
} from "@/lib/file-assets";
import { useExecutionResultsStore } from "@/lib/execution/store";
import { FaUpload, FaXmark } from "react-icons/fa6";
import { IconButton } from "@/ui/IconButton";
import { notifications } from "@mantine/notifications";
import { useNavigationStore } from "@/lib/store";
import { truncateMiddle } from "@/lib/utils";

interface FileInputProps extends Omit<
  HTMLAttributes<HTMLDivElement>,
  "onChange" | "defaultValue"
> {
  data: IData<InstanceDataType>;
  value?: string;
  onChange?: (value: string) => void;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const FileInputComponent = (
  { data, onChange, value, ...props }: FileInputProps,
  ref: React.ForwardedRef<HTMLDivElement>
) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const selectNavId = `${data.id}_file_select`;
  const clearNavId = `${data.id}_file_clear`;
  const isSelectFocused = useNavigationStore(
    (s) => s.navigation?.id === selectNavId && !s.navigation?.disable
  );
  const isClearFocused = useNavigationStore(
    (s) => s.navigation?.id === clearNavId && !s.navigation?.disable
  );
  const setNavigation = useNavigationStore((s) => s.setNavigation);
  const openFilePicker = useCallback(() => inputRef.current?.click(), []);

  const hydrateInstance = useCallback(
    (file: File) => {
      useExecutionResultsStore.getState().clearCache();
      useExecutionResultsStore.getState().setInstance(data.value.instanceId, {
        instance: file,
        type: data.type,
      });
    },
    [data.value.instanceId, data.type]
  );

  useEffect(() => {
    let cancelled = false;
    getFileAsset(data.value.instanceId).then((stored) => {
      if (cancelled) return;
      if (stored?.file) {
        setFile(stored?.file);
        hydrateInstance(stored?.file);
      } else setFile(null);
    });
    return () => {
      cancelled = true;
    };
  }, [data.value.instanceId, hydrateInstance]);

  const handleFileSelect = useCallback(
    async (file: File | undefined) => {
      if (!file) return;
      try {
        await saveFileAsset(data.value.instanceId, file);
        hydrateInstance(file);
        setFile(file);
      } catch {
        notifications.show({ message: "Failed to store file", color: "red" });
      }
    },
    [data.value.instanceId, hydrateInstance]
  );

  const handleClear = useCallback(async () => {
    await deleteFileAsset(data.value.instanceId);
    useExecutionResultsStore.getState().clearCache();
    useExecutionResultsStore.getState().setInstance(data.value.instanceId, {
      instance: undefined,
      type: data.type,
    });
    setFile(null);
  }, [data.value.instanceId, data.type]);

  return (
    <div className="flex items-start gap-1" ref={ref}>
      <div className="flex items-start gap-1">
        <BaseInput
          {...props}
          className="text-type"
          value={value}
          onChange={onChange}
        />
        <span>{"("}</span>
      </div>
      <div className="flex items-center gap-1">
        {file ? (
          <>
            <span
              ref={(elem) => isSelectFocused && elem?.focus()}
              role="button"
              tabIndex={-1}
              className="text-string cursor-pointer hover:underline"
              onClick={(e) => {
                e.stopPropagation();
                openFilePicker();
              }}
              onKeyDown={(e) => {
                if (e.key !== "Enter" && e.key !== " ") return;
                e.preventDefault();
                openFilePicker();
              }}
              onFocus={() => setNavigation({ navigation: { id: selectNavId } })}
              title={`${file.name} (${formatFileSize(file.size)})`}
            >
              {`"${truncateMiddle(file.name)}"`}
            </span>
            <IconButton
              ref={(elem) => isClearFocused && elem?.focus()}
              icon={FaXmark}
              title="Remove file"
              onClick={(e) => {
                e.stopPropagation();
                void handleClear();
              }}
              onFocus={() => setNavigation({ navigation: { id: clearNavId } })}
            />
          </>
        ) : (
          <IconButton
            ref={(elem) => isSelectFocused && elem?.focus()}
            icon={FaUpload}
            title="Upload file"
            onClick={(e) => {
              e.stopPropagation();
              openFilePicker();
            }}
            onFocus={() => setNavigation({ navigation: { id: selectNavId } })}
          />
        )}
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          onChange={(e) => {
            void handleFileSelect(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        <span className="self-end">{")"}</span>
      </div>
    </div>
  );
};

export const FileInput = memo(forwardRef(FileInputComponent));

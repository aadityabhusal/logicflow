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
              className="text-string cursor-pointer hover:underline"
              onClick={(e) => {
                e.stopPropagation();
                inputRef.current?.click();
              }}
              title={`${file.name} (${formatFileSize(file.size)})`}
            >
              {`"${file.name.length > 20 ? file.name.slice(0, 17) + "..." : file.name}"`}
            </span>
            <IconButton
              icon={FaXmark}
              title="Remove file"
              onClick={(e) => {
                e.stopPropagation();
                void handleClear();
              }}
            />
          </>
        ) : (
          <IconButton
            icon={FaUpload}
            title="Upload file"
            onClick={(e) => {
              e.stopPropagation();
              inputRef.current?.click();
            }}
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

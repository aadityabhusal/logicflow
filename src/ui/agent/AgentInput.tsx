import { Textarea, Button, Menu, Tooltip } from "@mantine/core";
import { useAgentStore } from "@/lib/store";
import { useState } from "react";
import { AVAILABLE_MODELS } from "@/lib/data";
import { FaArrowUp, FaChevronDown } from "react-icons/fa6";
import { IconButton } from "../IconButton";

interface AgentInputProps {
  onSubmit: (prompt: string) => void;
}

export function AgentInput({ onSubmit }: AgentInputProps) {
  const [value, setValue] = useState("");
  const { isLoading, selectedModel, getApiKey, setSelectedModel } =
    useAgentStore();
  const selectedModelConfig = AVAILABLE_MODELS.find(
    (m) => m.id === selectedModel
  );
  const modelHasApiKey = selectedModelConfig
    ? getApiKey(selectedModelConfig.provider)
    : false;

  const handleSubmit = () => {
    if (value.trim() && !isLoading) {
      onSubmit(value.trim());
      setValue("");
    }
  };

  return (
    <div className="flex flex-col border-t p-1 gap-1">
      <Textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Describe the changes you want..."
        autosize
        className="p-2"
        minRows={2}
        maxRows={10}
        disabled={isLoading}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSubmit();
          }
        }}
      />
      <div className="flex justify-between p-1 gap-2">
        <Menu position="top-start">
          <Menu.Target>
            <Button
              leftSection={<FaChevronDown size={12} />}
              className="outline-none"
            >
              {selectedModelConfig?.name ?? "Select modal"}
            </Button>
          </Menu.Target>
          <Menu.Dropdown>
            {AVAILABLE_MODELS.map((model) => (
              <Tooltip
                key={model.id}
                label={!getApiKey(model.provider) ? "Add API key" : ""}
                position="right"
                disabled={!!getApiKey(model.provider)}
              >
                <Menu.Item
                  onClick={() => setSelectedModel(model.id)}
                  classNames={{
                    item:
                      model.id === selectedModel ? "bg-dropdown-selected" : "",
                  }}
                  disabled={!getApiKey(model.provider)}
                >
                  {model.name}
                </Menu.Item>
              </Tooltip>
            ))}
          </Menu.Dropdown>
        </Menu>
        <IconButton
          onClick={handleSubmit}
          icon={FaArrowUp}
          loading={isLoading}
          className="px-2 outline"
          disabled={value.trim() === "" || !modelHasApiKey}
        />
      </div>
    </div>
  );
}

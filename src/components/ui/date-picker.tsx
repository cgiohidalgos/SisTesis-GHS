import { useEffect, useState } from "react";
import { format, parseISO } from "date-fns";
import { DayPicker } from "react-day-picker";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const DATE_FORMAT = "yyyy-MM-dd";

export interface DatePickerProps {
  value?: string | null;
  onChange: (value: string | null) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

export function DatePicker({
  value,
  onChange,
  placeholder,
  className,
  disabled,
}: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Date | undefined>(
    value ? parseISO(value) : undefined,
  );

  useEffect(() => {
    setSelected(value ? parseISO(value) : undefined);
  }, [value]);

  const handleSelect = (day: Date | undefined) => {
    setSelected(day);
    setOpen(false);
    onChange(day ? format(day, DATE_FORMAT) : null);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Input
          readOnly
          value={value || ""}
          placeholder={placeholder}
          className={cn(className)}
          onClick={() => {
            if (!disabled) setOpen(true);
          }}
          disabled={disabled}
        />
      </PopoverTrigger>
      <PopoverContent className="p-0">
        <DayPicker
          mode="single"
          selected={selected}
          onSelect={handleSelect}
          captionLayout="dropdown"
          className="rounded-md"
        />
      </PopoverContent>
    </Popover>
  );
}

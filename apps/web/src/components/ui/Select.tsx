import { useState } from 'react';
import { Check, ChevronDown, Plus, Search } from 'lucide-react';
import { cn } from '../../lib/utils';
import { Avatar } from './Avatar';
import { Menu, MenuItem, MenuLabel, MenuSeparator } from './Menu';

export interface SelectOption {
  value: string;
  label: string;
  color?: string;
  icon?: React.ReactNode;
  avatar?: { name: string; avatarUrl?: string | null };
  hint?: string;
}

interface SelectProps {
  options: SelectOption[];
  value: string | null;
  onChange: (value: string) => void;
  placeholder?: string;
  align?: 'start' | 'end';
  disabled?: boolean;
  className?: string;
  /** Renders a compact trigger for table rows / kanban cards. */
  compact?: boolean;
  width?: number;
  /** Shows a "No value" entry that maps to an empty string. */
  clearable?: boolean;
  clearLabel?: string;
  onCreate?: (query: string) => void;
  searchable?: boolean;
  ariaLabel?: string;
  trigger?: React.ReactNode;
}

/**
 * Dropdown used for every single-value field (status, priority, assignee,
 * project, cycle...). Renders in a portal so it escapes row overflow.
 */
export function Select({
  options,
  value,
  onChange,
  placeholder = 'Select…',
  align = 'start',
  disabled,
  className,
  compact,
  width = 240,
  clearable,
  clearLabel = 'No value',
  onCreate,
  searchable,
  ariaLabel,
  trigger,
}: SelectProps) {
  const [query, setQuery] = useState('');
  const selected = options.find((option) => option.value === value) ?? null;
  const filtered = query
    ? options.filter((option) => option.label.toLowerCase().includes(query.toLowerCase()))
    : options;

  return (
    <Menu
      align={align}
      width={width}
      trigger={(triggerProps) => (
        <button
          type="button"
          aria-label={ariaLabel ?? placeholder}
          disabled={disabled}
          data-testid="select-trigger"
          className={cn(
            'group inline-flex items-center gap-1.5 rounded-md text-left transition-colors disabled:opacity-50',
            compact ? 'px-1.5 py-0.5 text-xs hover:bg-hover' : 'w-full border border-line bg-surface px-2 py-1 hover:bg-hover',
            className,
          )}
          {...triggerProps}
          onClick={(event) => {
            if (disabled) return;
            setQuery('');
            triggerProps.onClick(event);
          }}
        >
          {trigger ?? (
            <>
              {selected?.color && (
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: selected.color }}
                />
              )}
              {selected?.icon && <span className="[&>svg]:h-3.5 [&>svg]:w-3.5">{selected.icon}</span>}
              {selected?.avatar && (
                <Avatar name={selected.avatar.name} src={selected.avatar.avatarUrl} size="xs" />
              )}
              <span className={cn('truncate', !selected && 'text-subtle')}>
                {selected?.label ?? placeholder}
              </span>
              <ChevronDown className="ml-auto h-3.5 w-3.5 shrink-0 text-subtle group-hover:text-muted" />
            </>
          )}
        </button>
      )}
    >
      <div className="max-h-72 overflow-y-auto">
        {searchable && (
          <div className="sticky top-0 z-10 mb-1 border-b border-line bg-elevated p-1">
            <div className="flex items-center gap-1.5 rounded-md bg-sunken px-2 py-1">
              <Search className="h-3.5 w-3.5 text-subtle" />
              <input
                autoFocus
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search…"
                className="w-full bg-transparent text-xs outline-none placeholder:text-subtle"
              />
            </div>
          </div>
        )}
        {clearable && (
          <MenuItem
            onClick={() => onChange('')}
            icon={<span className="h-2.5 w-2.5 rounded-full border border-line-strong" />}
          >
            <span className="text-muted">{clearLabel}</span>
          </MenuItem>
        )}
        {filtered.length === 0 && (
          <p className="px-2 py-3 text-center text-xs text-subtle">No matches</p>
        )}
        {filtered.map((option) => (
          <MenuItem
            key={option.value}
            onClick={() => onChange(option.value)}
            selected={option.value === value}
            icon={
              option.avatar ? (
                <Avatar name={option.avatar.name} src={option.avatar.avatarUrl} size="xs" />
              ) : option.color ? (
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: option.color }}
                />
              ) : (
                option.icon
              )
            }
          >
            <span className="flex items-center gap-1.5">
              <span className="truncate">{option.label}</span>
              {option.value === value && <Check className="h-3 w-3 shrink-0 text-accent" />}
            </span>
            {option.hint && <span className="ml-2 text-2xs text-subtle">{option.hint}</span>}
          </MenuItem>
        ))}
        {onCreate && (
          <>
            <MenuSeparator />
            <MenuItem icon={<Plus className="h-3.5 w-3.5" />} onClick={() => onCreate(query)}>
              {query ? `Create "${query}"` : 'Create new…'}
            </MenuItem>
          </>
        )}
      </div>
    </Menu>
  );
}

/** Multi-select with checkbox semantics, used for labels and filters. */
export function MultiSelect({
  options,
  values,
  onToggle,
  onClear,
  placeholder = 'Select…',
  width = 260,
  align = 'start',
  renderTrigger,
}: {
  options: SelectOption[];
  values: string[];
  onToggle: (value: string) => void;
  onClear?: () => void;
  placeholder?: string;
  width?: number;
  align?: 'start' | 'end';
  renderTrigger?: (selected: SelectOption[]) => React.ReactNode;
}) {
  const selected = options.filter((option) => values.includes(option.value));
  return (
    <Menu
      align={align}
      width={width}
      trigger={(triggerProps) => (
        <button
          type="button"
          data-testid="multiselect-trigger"
          className={cn(
            'inline-flex items-center gap-1.5 rounded-md border border-line bg-surface px-2 py-1 text-xs transition-colors hover:bg-hover',
            selected.length === 0 && 'text-subtle',
          )}
          {...triggerProps}
        >
          {renderTrigger ? (
            renderTrigger(selected)
          ) : (
            <>
              <span className="truncate">
                {selected.length === 0 ? placeholder : `${selected.length} selected`}
              </span>
              <ChevronDown className="h-3.5 w-3.5" />
            </>
          )}
        </button>
      )}
    >
      <div className="max-h-72 overflow-y-auto">
        {onClear && selected.length > 0 && (
          <>
            <MenuItem onClick={onClear}>Clear selection</MenuItem>
            <MenuSeparator />
          </>
        )}
        {options.length === 0 && <p className="px-2 py-3 text-center text-xs text-subtle">Nothing to choose</p>}
        {options.map((option) => {
          const active = values.includes(option.value);
          return (
            <MenuItem key={option.value} onClick={() => onToggle(option.value)} selected={active}>
              <span className="flex items-center gap-2">
                <span
                  className={cn(
                    'flex h-3.5 w-3.5 items-center justify-center rounded border',
                    active ? 'border-accent bg-accent text-accent-fg' : 'border-line-strong',
                  )}
                >
                  {active && <Check className="h-2.5 w-2.5" />}
                </span>
                {option.color && (
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: option.color }} />
                )}
                {option.avatar && (
                  <Avatar name={option.avatar.name} src={option.avatar.avatarUrl} size="xs" />
                )}
                <span className="truncate">{option.label}</span>
              </span>
            </MenuItem>
          );
        })}
      </div>
    </Menu>
  );
}

export function MenuSectionLabel({ children }: { children: React.ReactNode }) {
  return <MenuLabel>{children}</MenuLabel>;
}

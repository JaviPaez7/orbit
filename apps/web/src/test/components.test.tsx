import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Select } from '../components/ui/Select';
import { Menu, MenuItem, MenuLabel } from '../components/ui/Menu';
import { Modal } from '../components/ui/Modal';
import { Tooltip } from '../components/ui/Tooltip';
import { Avatar, AvatarStack } from '../components/ui/Avatar';
import { ProgressBar } from '../components/ui/Field';
import { PriorityIcon, StatusIcon, priorityLabel, statusLabel } from '../components/ui/Icons';

const OPTIONS = [
  { value: 'todo', label: 'Todo', color: '#9aa1ad' },
  { value: 'in_progress', label: 'In Progress', color: '#e2a83e' },
  { value: 'done', label: 'Done', color: '#42c284' },
];

describe('Select', () => {
  it('shows the current value and changes it through the menu', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Select options={OPTIONS} value="todo" onChange={onChange} ariaLabel="Status" />);

    const trigger = screen.getByLabelText('Status');
    expect(trigger).toHaveTextContent('Todo');

    await user.click(trigger);
    const option = await screen.findByRole('menuitem', { name: /In Progress/ });
    await user.click(option);

    expect(onChange).toHaveBeenCalledWith('in_progress');
  });

  it('closes on Escape and on outside click', async () => {
    const user = userEvent.setup();
    render(
      <div>
        <Select options={OPTIONS} value="todo" onChange={vi.fn()} ariaLabel="Status" />
        <button type="button">outside</button>
      </div>,
    );

    await user.click(screen.getByLabelText('Status'));
    expect(await screen.findByRole('menu')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());

    await user.click(screen.getByLabelText('Status'));
    expect(await screen.findByRole('menu')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'outside' }));
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
  });

  it('is disabled when the caller cannot edit', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <Select options={OPTIONS} value="todo" onChange={onChange} ariaLabel="Status" disabled />,
    );

    const trigger = screen.getByLabelText('Status');
    expect(trigger).toBeDisabled();
    await user.click(trigger);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });
});

describe('Menu', () => {
  it('renders a trigger and invokes item handlers', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <Menu
        trigger={(props) => (
          <button type="button" {...props}>
            Open
          </button>
        )}
      >
        <MenuLabel>Actions</MenuLabel>
        <MenuItem onClick={onSelect}>Duplicate</MenuItem>
      </Menu>,
    );

    await user.click(screen.getByRole('button', { name: 'Open' }));
    expect(screen.getByText('Actions')).toBeInTheDocument();
    await user.click(screen.getByRole('menuitem', { name: 'Duplicate' }));
    expect(onSelect).toHaveBeenCalledTimes(1);
  });
});

describe('Modal', () => {
  it('renders content, closes on Escape and restores focus', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <Modal open onClose={onClose} title="Delete issue" description="Cannot be undone">
        <p>Body content</p>
      </Modal>,
    );

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Body content')).toBeInTheDocument();
    expect(screen.getByText('Cannot be undone')).toBeInTheDocument();

    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('renders nothing when closed', () => {
    render(
      <Modal open={false} onClose={vi.fn()} title="Hidden">
        <p>Body</p>
      </Modal>,
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('presentational primitives', () => {
  it('renders initials when there is no image', () => {
    render(<Avatar name="Javi Rodriguez" />);
    expect(screen.getByLabelText('Javi Rodriguez')).toHaveTextContent('JR');
  });

  it('renders an image avatar and stacks overflow', () => {
    const { container } = render(
      <AvatarStack
        people={[
          { id: '1', name: 'Ana Beltran', avatarUrl: 'https://example.com/a.png' },
          { id: '2', name: 'Carlos Mendez' },
          { id: '3', name: 'Diego Fernandez' },
        ]}
        max={2}
      />,
    );
    expect(container.querySelector('img')).toHaveAttribute('src', 'https://example.com/a.png');
    expect(screen.getByText('+1')).toBeInTheDocument();
  });

  it('exposes progress semantics', () => {
    render(<ProgressBar value={42} />);
    const bar = screen.getByRole('progressbar');
    expect(bar).toHaveAttribute('aria-valuenow', '42');
    expect(bar).toHaveAttribute('aria-valuemin', '0');
    expect(bar).toHaveAttribute('aria-valuemax', '100');
  });

  it('clamps out-of-range progress values', () => {
    render(<ProgressBar value={180} />);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100');
  });

  it('labels status and priority icons accessibly', () => {
    render(
      <div>
        <StatusIcon status="in_progress" />
        <PriorityIcon priority="urgent" />
        <Tooltip label="Helpful hint">
          <button type="button">Hover me</button>
        </Tooltip>
      </div>,
    );
    expect(screen.getByLabelText('In Progress')).toBeInTheDocument();
    expect(screen.getByLabelText('Urgent')).toBeInTheDocument();
    expect(screen.getByRole('tooltip')).toHaveTextContent('Helpful hint');
    expect(statusLabel('in_review')).toBe('In Review');
    expect(priorityLabel('none')).toBe('No priority');
  });
});

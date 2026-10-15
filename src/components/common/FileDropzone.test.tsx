import { fireEvent, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { FileDropzone } from '@/components/common/FileDropzone';
import { renderWithProviders } from '@/test/render';

function Harness({ onChange }: { onChange: (file: File | null) => void }) {
  const [file, setFile] = useState<File | null>(null);
  return (
    <FileDropzone
      label="Schedule file"
      accept={['.xer', '.xml', '.csv']}
      maxBytes={20 * 1024 * 1024}
      hint="Hint"
      value={file}
      onChange={(next) => {
        setFile(next);
        onChange(next);
      }}
    />
  );
}

describe('FileDropzone', () => {
  it('passes the chosen file up and shows its name and size', async () => {
    const onChange = vi.fn();
    const { user } = renderWithProviders(<Harness onChange={onChange} />);
    await user.upload(
      screen.getByLabelText('Schedule file', { selector: 'input' }),
      new File(['abc'], 'plan.xer'),
    );
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ name: 'plan.xer' }));
    expect(screen.getByText('plan.xer')).toBeInTheDocument();
    expect(screen.getByText('3 B')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Remove file' }));
    expect(onChange).toHaveBeenLastCalledWith(null);
  });

  it('accepts a dropped file', () => {
    const onChange = vi.fn();
    renderWithProviders(<Harness onChange={onChange} />);
    fireEvent.drop(screen.getByRole('button', { name: 'Schedule file' }), {
      dataTransfer: { files: [new File(['x'], 'drop.csv')] },
    });
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ name: 'drop.csv' }));
  });

  it('moves focus to the drop area when the file is removed', async () => {
    const { user } = renderWithProviders(<Harness onChange={vi.fn()} />);
    await user.upload(
      screen.getByLabelText('Schedule file', { selector: 'input' }),
      new File(['abc'], 'plan.xer'),
    );
    await user.click(screen.getByRole('button', { name: 'Remove file' }));
    expect(screen.queryByText('plan.xer')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Schedule file' })).toHaveFocus();
  });
});

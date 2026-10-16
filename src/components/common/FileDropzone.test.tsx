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

function PhotoHarness({ accept = ['image/jpeg', 'image/png'] }: { accept?: string[] }) {
  const [file, setFile] = useState<File | null>(null);
  return (
    <FileDropzone
      label="Photo"
      accept={accept}
      maxBytes={5 * 1024 * 1024}
      hint="Hint"
      thumbnail
      value={file}
      onChange={setFile}
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

  it('previews only images whose type the accept list names', async () => {
    const { user } = renderWithProviders(<PhotoHarness />);
    const input = screen.getByLabelText('Photo', { selector: 'input' });
    for (const [name, type] of [
      ['site.gif', 'image/gif'],
      ['site.webp', 'image/webp'],
      ['site.svg', 'image/svg+xml'],
    ] as const) {
      await user.upload(input, new File(['x'], name, { type }));
      expect(screen.getByText(name)).toBeInTheDocument();
      expect(screen.queryByRole('presentation')).not.toBeInTheDocument();
    }
    await user.upload(input, new File(['x'], 'site.jpg', { type: 'image/jpeg' }));
    expect(screen.getByRole('presentation')).toHaveAttribute(
      'src',
      expect.stringMatching(/^blob:/),
    );
  });

  it('matches accepted extensions without regard to case', async () => {
    const { user } = renderWithProviders(<PhotoHarness accept={['.JPG', '.png']} />);
    const input = screen.getByLabelText('Photo', { selector: 'input' });
    await user.upload(input, new File(['x'], 'site.gif', { type: 'image/gif' }));
    expect(screen.queryByRole('presentation')).not.toBeInTheDocument();
    await user.upload(input, new File(['x'], 'Site.jpg', { type: 'image/jpeg' }));
    expect(screen.getByRole('presentation')).toBeInTheDocument();
  });

  it('frees the object URL of a replaced, removed or unmounted thumbnail', async () => {
    const createObjectURL = vi.spyOn(URL, 'createObjectURL');
    const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL');
    /** The URLs created and not yet revoked. */
    function liveUrls(): string[] {
      const revoked = new Set(revokeObjectURL.mock.calls.map(([url]) => url));
      return createObjectURL.mock.results
        .map((result) => String(result.value))
        .filter((url) => !revoked.has(url));
    }
    const { user, unmount } = renderWithProviders(<PhotoHarness />);
    const input = screen.getByLabelText('Photo', { selector: 'input' });
    await user.upload(input, new File(['a'], 'a.png', { type: 'image/png' }));
    const first = screen.getByRole('presentation').getAttribute('src');
    expect(liveUrls()).toEqual([first]);
    await user.upload(input, new File(['b'], 'b.png', { type: 'image/png' }));
    const second = screen.getByRole('presentation').getAttribute('src');
    expect(second).not.toBe(first);
    expect(liveUrls()).toEqual([second]);
    await user.click(screen.getByRole('button', { name: 'Remove file' }));
    expect(liveUrls()).toEqual([]);
    await user.upload(input, new File(['c'], 'c.png', { type: 'image/png' }));
    expect(liveUrls()).toHaveLength(1);
    unmount();
    expect(liveUrls()).toEqual([]);
    expect(createObjectURL).toHaveBeenCalledTimes(3);
  });
});

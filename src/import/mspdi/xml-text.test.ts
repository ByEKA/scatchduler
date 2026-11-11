import { describe, expect, it } from 'vitest';
import { decodeXmlText } from '@/import/mspdi/xml-text';

describe('decodeXmlText', () => {
  it('decodes the five entities and character references and replaces bad ones', () => {
    expect(
      decodeXmlText('Kazı &amp; Dolgu &lt;A&gt; &quot;x&quot; &apos;y&apos; &#304;zmir &#x15F;'),
    ).toEqual({ text: 'Kazı & Dolgu <A> "x" \'y\' İzmir ş', badCharacters: [] });
    expect(decodeXmlText('a&#0;b&#xD800;c&#x110000;d')).toEqual({
      text: 'a�b�c�d',
      badCharacters: ['&#0;', '&#xD800;', '&#x110000;'],
    });
  });
});

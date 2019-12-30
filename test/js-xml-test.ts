import { assert } from 'chai';
import * as jsxml from '../index';

const { deepEqual, strictEqual } = assert;

function short(s: string): string {
    return s.length < 50 ? s : s.substring(0, 47) + '...';
}

function parseTest(xml: string, js: any, skipRT?: boolean): void {
    deepEqual(jsxml.parse(xml), js, 'parse ' + short(xml));
    if (!skipRT) strictEqual(jsxml.stringify(jsxml.parse(xml)), xml, 'roundtrip ' + short(xml));
}

function parseNsTest(xml: string, js: any) {
    deepEqual(jsxml.normalizeNamespaces(jsxml.parse(xml)), js, 'parse (with namespaces) ' + xml);
}

function rtTest(name: string, xml: string, indent: string | null, result: any) {
    strictEqual(
        jsxml.stringify(jsxml.parse(xml), {
            indent: indent,
        }),
        result || xml,
        name,
    );
}

function reviverTest(xml: string, js: any, reviver: jsxml.Reviver) {
    deepEqual(jsxml.parse(xml, reviver), js, 'revive ' + xml);
}

describe('jsxml', () => {
    it('simple tag without attributes', () => {
        parseTest('<a/>', {
            a: {},
        });
        parseTest('<a></a>', {
            a: '',
        });
        parseTest('<a>5</a>', {
            a: '5',
        });
    });
    it('simple tag with attributes', () => {
        parseTest('<a x="3" y="4">5</a>', {
            a: {
                $: {
                    x: '3',
                    y: '4',
                },
                $value: '5',
            },
        });
        parseTest('<a x="3"></a>', {
            a: {
                $: {
                    x: '3',
                },
                $value: '',
            },
        });
        parseTest('<a x="3"/>', {
            a: {
                $: {
                    x: '3',
                },
            },
        });
        parseTest('<a> &#x0d;&#x0a;&#x09;</a>', {
            a: ' \r\n\t',
        });
        parseTest('<a x="3"> &#x0d;&#x0a;&#x09;</a>', {
            a: {
                $: {
                    x: '3',
                },
                $value: ' \r\n\t',
            },
        });
    });

    it('attribute with simple quote', () => {
        parseTest(
            "<a x='3'/>",
            {
                a: {
                    $: {
                        x: '3',
                    },
                },
            },
            true,
        );
    });

    it('entities', () => {
        parseTest('<a x="a&gt;b&apos;c&lt;"/>', {
            a: {
                $: {
                    x: "a>b'c<",
                },
            },
        });
        parseTest('<a>a&gt;b&apos;c&lt;</a>', {
            a: "a>b'c<",
        });
    });
    it('children', () => {
        parseTest('<a><b>3</b><c>4</c></a>', {
            a: {
                b: '3',
                c: '4',
            },
        });
        parseTest('<a><b x="2">3</b><c>4</c></a>', {
            a: {
                b: {
                    $: {
                        x: '2',
                    },
                    $value: '3',
                },
                c: '4',
            },
        });
        parseTest('<a><b>3</b><b>4</b><c>5</c></a>', {
            a: {
                b: ['3', '4'],
                c: '5',
            },
        });
    });

    it('cdata', () => {
        parseTest('<a><![CDATA[<abc>]]></a>', {
            a: {
                $cdata: '<abc>',
            },
        });
        parseTest('<a><![CDATA[]]></a>', {
            a: {
                $cdata: '',
            },
        });
    });

    it('comments in text', () => {
        parseTest(
            '<a>abc <!-- <b>def</b> --> ghi</a>',
            {
                a: 'abc  ghi',
            },
            true,
        );
    });

    it('reformatting', () => {
        rtTest('spaces outside', ' \r\n\t <a/> \t', null, '<a/>');
        rtTest('spaces inside tag', '<a  x="v1"y="v2"\t/>', null, '<a x="v1" y="v2"/>');
        rtTest('spaces around children', '<a> <b />\n<c\n/>\t</a>', null, '<a><b/><c/></a>');
        rtTest('spaces and cdata', '<a> \n<![CDATA[ <abc>\n\t]]>\t</a>', null, '<a><![CDATA[ <abc>\n\t]]></a>');
        rtTest('spaces in value', '<a> </a>', null, '<a> </a>');
        rtTest('more spaces in value', '<a> \r\n\t</a>', null, '<a> &#x0d;&#x0a;&#x09;</a>');
        rtTest(
            'indentation',
            '<a><b x="3">5</b><c><d/></c></a>',
            '\t',
            '<a>\n\t<b x="3">5</b>\n\t<c>\n\t\t<d/>\n\t</c>\n</a>',
        );
    });

    it('empty element in list', () => {
        parseTest(
            '<a><b></b><b>x</b><b></b></a>',
            {
                a: {
                    b: ['', 'x', ''],
                },
            },
            true,
        );
    });

    it('namespace transformation', () => {
        parseNsTest('<a/>', {
            a: {},
        });
        parseNsTest('<t:a xmlns:t="xyz"></t:a>', {
            'xyz|a': '',
        });
        parseNsTest('<t:a xmlns:t="xyz" />', {
            'xyz|a': {},
        });
        parseNsTest('<a xmlns="abc" x="3" y="4">5</a>', {
            'abc|a': {
                $: {
                    x: '3',
                    y: '4',
                },
                $value: '5',
            },
        });
        parseNsTest('<a xmlns="abc" t:x="3" y="4" xmlns:t="xyz"><b><c xmlns="def"/></b></a>', {
            'abc|a': {
                $: {
                    'xyz|x': '3',
                    y: '4',
                },
                'abc|b': {
                    'def|c': {},
                },
            },
        });
        parseNsTest(
            '<t:a xmlns="abc" t:x="3" y="4" xmlns:t="xyz"><b><t:c xmlns="def">55</t:c></b><v:d xmlns:v="ddd" t:y="7" /></t:a>',
            {
                'xyz|a': {
                    $: {
                        'xyz|x': '3',
                        y: '4',
                    },
                    'abc|b': {
                        'xyz|c': '55',
                    },
                    'ddd|d': {
                        $: {
                            'xyz|y': '7',
                        },
                    },
                },
            },
        );
        parseNsTest('<t xmlns:x="abc"><a xmlns="abc">1</a><x:a>2</x:a><a xmlns="def">3</a><a xmlns="abc">4</a></t>', {
            t: {
                'abc|a': ['1', '4', '2'],
                'def|a': '3',
            },
        });
    });

    it('simplify', () => {
        reviverTest(
            '<a atb1="x"><b atb2="y">3</b><c>4</c><c y="3">5</c><c xsi:nil="true"/></a>',
            {
                a: {
                    b: '3',
                    c: ['4', '5', null],
                },
            },
            jsxml.simplify,
        );
    });

    it('escaping', () => {
        let xml = '<a>';
        let js = '';
        for (let i = 0; i < 0x10000; i++) {
            // tab, cr, lf, ' and " could be formatted verbatim but we escape them
            if ((i >= 0x20 && i <= 0x7e) || (i >= 0xa1 && i <= 0xd7ff) || (i >= 0xe000 && i <= 0xfffd)) {
                if (i >= 0x2000 && i < 0xd000) continue; // skip to speed up test
                const ch = String.fromCharCode(i);
                if (ch === '<') xml += '&lt;';
                else if (ch === '>') xml += '&gt;';
                else if (ch === '&') xml += '&amp;';
                else if (ch === '"') xml += '&quot;';
                else if (ch === "'") xml += '&apos;';
                else xml += ch;
            } else {
                let hex = i.toString(16);
                while (hex.length < 2) hex = '0' + hex;
                while (hex.length > 2 && hex.length < 4) hex = '0' + hex;
                xml += '&#x' + hex + ';';
            }
            js += String.fromCharCode(i);
        }
        xml += '</a>';
        parseTest(xml, {
            a: js,
        });
    });
});

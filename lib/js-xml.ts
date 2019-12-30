/// !doc
///
/// # Simple XML parser and formatter
///
/// Transforms back and forth between XML and JS.
/// Tries to generate a JS object which is as simple as possible, without losing information.
///
/// Uses the following rules when converting from XML to JS:
/// * all values are returned as strings. No attempt to convert numbers and booleans
/// * attributes are mapped to a `$` subobject.
/// * simple values are mapped to an object with a `$value` property if the tag has attributes.
/// * simple values are mapped to a string if the tag does not have attributes.
/// * repeating tags are mapped to an array.
/// * CDATA sections are mapped to an object with a `$cdata` property.
/// * self-closing tags are returned as an empty object.
///
/// Some examples:
///
/// ```
/// <a>hello world</a>  --> { a: "hello world" }
/// <a x="hello">world</a>  --> { a: { $: { x: "hello" }, $value: "world" } }
/// <a><b>hello</b><c>world</c></a>  --> { a: { b : "hello", c: "world" } }
/// <a><b>hello</b><b>world</b></a>  --> { a: { b : ["hello", "world"] }
/// <a></a>  --> { a: "" }
/// <a/>  --> { a: {} }
/// ```
///
/// See the `test/common/js-xml-test.js` unit test for more examples.
///
/// ## API
///
/// `let jsxml = require('js-xml')`
///
type Dict<T> = { [key: string]: T };

const begWord = {} as Dict<boolean>,
    inWord = {} as Dict<boolean>,
    space = {} as Dict<boolean>,
    LF = '\n'.charCodeAt(0),
    LT = '<'.charCodeAt(0),
    GT = '>'.charCodeAt(0),
    EXCLAM = '!'.charCodeAt(0),
    QMARK = '?'.charCodeAt(0),
    SLASH = '/'.charCodeAt(0),
    OBRA = '['.charCodeAt(0),
    EQ = '='.charCodeAt(0),
    DASH = '-'.charCodeAt(0),
    entitiesByChar = {
        '&': 'amp',
        '<': 'lt',
        '>': 'gt',
        '"': 'quot',
        "'": 'apos',
    } as Dict<string>,
    entitiesByName = {} as Dict<string>;

(function() {
    function add(clas: Dict<boolean>, chs: string, i = 0) {
        chs.split('').forEach(function(ch) {
            clas[ch.charCodeAt(0) + i] = true;
        });
    }
    for (let i = 0; i <= 9; i++) add(inWord, '0', i);
    for (let i = 0; i < 26; i++) add(begWord, 'aA', i), add(inWord, 'aA', i);
    add(begWord, ':_'), add(inWord, ':_-.');
    add(space, ' \t\r\n');
    Object.keys(entitiesByChar).forEach(function(ch) {
        entitiesByName[entitiesByChar[ch]] = ch;
    });
})();

export interface Element {
    $cdata?: any;
    $value?: any;
    $childCount: number;
    $index?: number;
    [tag: string]: any;
}

function builder(error: (message: string) => void) {
    const root: Element = {
        $childCount: 0,
    };
    let elt = root;
    return {
        push(tag: string): void {
            if (elt.$cdata != null) throw error('cannot mix CDATA and children');
            if (elt.$value != null) throw error('cannot mix value and children');
            elt.$childCount++;
            const child: Element = {
                $tag: tag,
                $parent: elt,
                $childCount: 0,
            };
            if (elt[tag] != null) {
                if (!Array.isArray(elt[tag])) elt[tag] = [elt[tag]];
                child.$index = elt[tag].length;
                elt[tag].push(child);
            } else {
                elt[tag] = child;
            }
            elt = child;
        },
        pop(tag?: string): void {
            if (tag && tag !== elt.$tag) throw error('closing tag mismatch: expected ' + elt.$tag + ', got ' + tag);
            const parent = elt.$parent;
            if (!parent) throw error('too many closing tags');
            delete elt.$parent;
            // if elt does not have attributes, replace it by value in parent
            if (elt.$value !== undefined && !elt.$) {
                if (elt.$index === undefined) parent[elt.$tag] = elt.$value;
                else parent[elt.$tag][elt.$index] = elt.$value;
            } else {
                delete elt.$tag;
                delete elt.$childCount;
                delete elt.$index;
            }
            elt = parent;
        },
        attribute(atb: string, val: any): void {
            elt.$ = elt.$ || {};
            if (elt.$[atb] != null) throw error('duplicate attribute: ' + atb);
            elt.$[atb] = val;
        },
        value(val: any): void {
            if (elt.$cdata != null) throw error('cannot mix CDATA and value');
            if (elt.$childCount) throw error('cannot mix children and value');
            elt.$value = val;
        },
        cdata(val: any): void {
            if (elt.$value != null) throw error('cannot mix value and CDATA');
            if (elt.$childCount) throw error('cannot mix children and CDATA');
            elt.$cdata = val;
        },
        getResult(): Element {
            if (elt !== root) throw error('tag not closed: ' + elt.$tag);
            if (!root.$childCount) throw error('root tag not found');
            if (root.$childCount !== 1) throw error('too many elements at top level');
            delete root.$childCount;
            return root;
        },
    };
}

export type Reviver = (key: string, val: any) => any;

/// * `obj = jsxml.parse(xml)`
///   Parses an xml string and returns a JS object.
///   The returned object has a single property named after the root tag.
///   See examples above.
export function parse(str: string, reviver?: Reviver): any {
    let pos = str.indexOf('<');
    const len = str.length,
        bld = builder(error);

    function error(msg: string): Error {
        const m = str.substring(pos).match(/[\n\>]/);
        const end = m ? pos + (m.index || 0) + 1 : str.length;
        const line = str.substring(0, pos).split('\n').length;
        return new Error('Invalid XML: ' + msg + ' at line ' + line + ' near ' + str.substring(pos, end));
    }

    function eatSpaces(): void {
        while (space[str.charCodeAt(pos)]) pos++;
    }

    function eat(ch: number): void {
        if (str.charCodeAt(pos) !== ch) {
            throw error("expected '" + String.fromCharCode(ch) + "', got '" + str[pos] + "'");
        }
        pos++;
    }

    function eatQuote(): string {
        const ch = str[pos];
        if (ch !== '"' && ch !== "'") throw error("expected quote, got '" + ch + "'");
        pos++;
        return ch;
    }

    function clean(str: string): string {
        return str.replace(/&([^;]+);/g, function(s, ent) {
            const ch = entitiesByName[ent];
            if (ch) return ch;
            if (ent[0] !== '#') throw error('invalid entity: &' + ent + ';');
            ent = ent.substring(1);
            let radix = 10;
            if (ent[0] === 'x') {
                ent = ent.substring(1);
                radix = 16;
            }
            const v = parseInt(ent, radix);
            if (isNaN(v)) throw error('hex value expected, got ' + ent);
            return String.fromCharCode(v);
        });
    }

    function checkEmpty(str: string): void {
        if (str.match(/[^ \t\r\n]/)) throw error('unexpected value: ' + str);
    }

    while (pos < len) {
        eat(LT);
        let beg = pos;
        let ch = str.charCodeAt(pos++);
        if (begWord[ch]) {
            while (inWord[str.charCodeAt(pos)]) pos++;
            bld.push(str.substring(beg, pos));
            while (true) {
                eatSpaces();
                beg = pos;
                ch = str.charCodeAt(pos++);
                if (ch === SLASH) {
                    eat(GT);
                    bld.pop();
                    break;
                } else if (begWord[ch]) {
                    while (inWord[str.charCodeAt(pos)]) pos++;
                    const atb = str.substring(beg, pos);
                    eatSpaces();
                    eat(EQ);
                    eatSpaces();
                    const quote = eatQuote();
                    beg = pos;
                    pos = str.indexOf(quote, pos);
                    if (pos < 0) throw error('double quote missing');
                    bld.attribute(atb, clean(str.substring(beg, pos)));
                    pos++;
                } else if (ch === GT) {
                    let val = '';
                    let j: number;
                    while (true) {
                        j = str.indexOf('<', pos);
                        if (j < 0) throw error('tag not closed');
                        if (str.charCodeAt(j + 1) === EXCLAM && str.substring(j + 2, j + 4) === '--') {
                            val += clean(str.substring(pos, j));
                            pos = j + 4;
                            j = str.indexOf('-->', pos);
                            if (j < 0) throw error('unterminated comment');
                            pos = j + 3;
                        } else {
                            break;
                        }
                    }
                    val += clean(str.substring(pos, j));
                    if (str.charCodeAt(j + 1) === SLASH) bld.value(val), (pos = j);
                    else checkEmpty(val);
                    break;
                } else {
                    pos--;
                    throw error("unexpected character: '" + str[pos] + "'");
                }
            }
        } else if (ch === SLASH) {
            let tag = undefined;
            beg = pos;
            ch = str.charCodeAt(pos);
            if (begWord[ch]) {
                pos++;
                while (inWord[str.charCodeAt(pos)]) pos++;
                tag = str.substring(beg, pos);
            }
            eatSpaces();
            eat(GT);
            bld.pop(tag);
        } else if (ch === EXCLAM) {
            ch = str.charCodeAt(pos++);
            if (ch === DASH && str.charCodeAt(pos++) === DASH) {
                const j = str.indexOf('-->', pos);
                if (j < 0) throw error('--> missing');
                pos = j + 3;
            } else if (ch === OBRA && str.substring(pos, pos + 6) === 'CDATA[') {
                pos += 6;
                const j = str.indexOf(']]>', pos);
                if (j < 0) throw error(']]> missing');
                bld.cdata(str.substring(pos, j));
                pos = j + 3;
                eatSpaces();
            } else {
                throw error('invalid syntax after <!');
            }
        } else if (ch === QMARK) {
            const j = str.indexOf('?>', pos);
            if (j < 0) throw error('?> missing');
            pos = j + 2;
        } else {
            throw error('unexpected character: ' + str[beg]);
        }
        eatSpaces();
    }
    return revive(bld.getResult(), reviver);
}

export function revive(obj: any, reviver?: Reviver): any {
    if (!reviver) return obj;

    function reviveOne(key: string, val: any): any {
        if (Array.isArray(val)) {
            val = val.map(function(elt, i) {
                return reviveOne('' + i, elt);
            });
        } else if (typeof val === 'object' && val !== null) {
            val = Object.keys(val).reduce(function(r, k) {
                r[k] = reviveOne(k, val[k]);
                return r;
            }, {} as any);
        }
        return reviver!(key, val);
    }
    return reviveOne('', obj);
}

export interface XmlFormatterOptions {
    indent?: string | null;
}

function formatter(options: XmlFormatterOptions) {
    let str = '',
        depth = 0;

    function indent() {
        str += '\n' + Array(depth + 1).join(options.indent || '\t');
    }

    function escape(val: any): string {
        return typeof val !== 'string'
            ? '' + val
            : val.replace(/([&<>"']|[^ -~\u00a1-\ud7ff\ue000-\ufffd])/g, function(ch) {
                  const ent = entitiesByChar[ch];
                  if (ent) return '&' + ent + ';';
                  let hex = ch.charCodeAt(0).toString(16);
                  while (hex.length < 2) hex = '0' + hex;
                  while (hex.length > 2 && hex.length < 4) hex = '0' + hex;
                  return '&#x' + hex + ';';
              });
    }
    return {
        beginTag(tag: string): void {
            options.indent && indent();
            str += '<' + tag;
            depth++;
        },
        addAttribute(atb: string, val: any): void {
            str += ' ' + atb + '="' + escape(val) + '"';
        },
        endTag(close?: boolean) {
            if (close) depth--;
            str += close ? '/>' : '>';
        },
        closeTag(tag: string, val?: any): void {
            depth--;
            if (val != null) {
                str += escape(val);
            } else {
                options.indent && indent();
            }
            str += '</' + tag + '>';
        },
        cdata(data: any): void {
            str += '<![CDATA[' + data + ']]>';
        },
        getResult(): any {
            // indexOf to eliminate newline that indent may put before root
            return str.substring(str.indexOf('<'));
        },
    };
}

///
/// * `obj2 = jsxml.normalizeNamespaces(obj)`
///   returns an object which has similar structure as the incoming object (obtained by `parse` function).
///   namespaces will be attached to the tags, e. g. a tag "ns:tag" where "ns" is declared as namespace "http://x.y.z",
///   will be transformed to "http://x.y.z|tag". Namespace declarations will be removed.
///
export function normalizeNamespaces(obj: any) {
    return _normalizeNamespaces(obj, {});
}

function _normalizeNamespaces(obj: any, ns: Dict<string>, tag?: string): any {
    if (!obj || typeof obj !== 'object') {
        if (tag) {
            const parts = tag.split(':');
            if (parts[1]) {
                return [ns[parts[0]] + '|' + parts[1], obj];
            } else if (ns['']) {
                return [ns[''] + '|' + tag, obj];
            } else return [tag, obj];
        }
        return obj;
    }
    // new namespaces?
    const attributes = obj.$;
    let result = {} as Dict<any>;
    let onlyValue = true; // is there only a $value?

    function _addEntry(name: string, val: any): void {
        const res = _normalizeNamespaces(val, ns, name);
        const tmp = result[res[0]];
        if (tmp) {
            if (Array.isArray(tmp)) tmp.push(res[1]);
            else result[res[0]] = [tmp, res[1]];
        } else result[res[0]] = res[1];
        onlyValue = false;
    }

    if (attributes) {
        let nameSpaceDecl = false; // is there a namespace declaration?
        let nameSpaceAttr = false; // is there an attribute with explicit namespace?
        let bareAttr = false; // is there an attribute without explicit namespace (will have no namespace)
        for (const att in attributes) {
            const parts = att.split(':');
            if (parts[0] === 'xmlns') {
                // namespace declaration
                // maybe clone namespace object
                if (!nameSpaceDecl) {
                    nameSpaceDecl = true;
                    const ns2 = {} as Dict<any>;
                    for (const c in ns) {
                        ns2[c] = ns[c];
                    }
                    ns = ns2;
                }
                ns[parts[1] || ''] = attributes[att];
                continue;
            }
            if (parts[1]) {
                nameSpaceAttr = true;
            } else bareAttr = true;
        }
        if (nameSpaceAttr || bareAttr) {
            if (nameSpaceDecl || nameSpaceAttr) {
                // namespace translation necessary only for attributes with explicit XML namespace
                result.$ = {};
                for (const att in attributes) {
                    const parts = att.split(':');
                    if (parts[0] !== 'xmlns') {
                        if (parts[1]) {
                            // attribute with explicit namespace declaration
                            result.$[ns[parts[0]] + '|' + parts[1]] = attributes[att];
                        } else {
                            result.$[att] = attributes[att];
                        }
                    }
                }
            } else {
                // no attribute transformation necessary
                result.$ = attributes;
            }
            onlyValue = false;
        } // when all attributes are just namespace declarations, do not create attribute object
    }
    let value = undefined;
    for (const b in obj) {
        if (b[0] === '$') {
            // special items: only copy value attribute
            if (b === '$value') {
                value = obj[b];
            }
            continue;
        }
        if (b) {
            const val = obj[b];
            if (Array.isArray(val)) {
                val.forEach(item => {
                    _addEntry(b, item);
                });
            } else _addEntry(b, obj[b]);
        }
    }
    if (value !== undefined) {
        if (onlyValue) result = value;
        else result.$value = value;
    }
    if (tag) {
        const parts = tag.split(':');
        if (parts[1]) {
            return [ns[parts[0]] + '|' + parts[1], result];
        } else if (ns['']) {
            return [ns[''] + '|' + tag, result];
        } else return [tag, result];
    }
    return result;
}

///
/// * `xml = jsxml.stringify(obj[, options])`
///   Formats a JS object in XML.
///   The object must have a single property which will give its name to the root tag.
///   `options` lets you specify the indentation, either as a string (`'\t'` for example),
///   or as an { indent: '\t' } object. The second form may be used to introduce more options later.
export function stringify(elt: Element, options?: XmlFormatterOptions) {
    options =
        typeof options === 'string'
            ? {
                  indent: options,
              }
            : options || {};
    const fmt = formatter(options);

    function error(msg: string): Error {
        return new Error(msg);
    }

    function strfy(elt: Element, tag: string): void {
        if (elt === undefined) return;
        if (Array.isArray(elt)) {
            elt.forEach(function(child) {
                strfy(child, tag);
            });
            return;
        }
        fmt.beginTag(tag);
        if (elt === null) {
            fmt.addAttribute('xsi:nil', 'true');
            fmt.endTag(true);
        } else if (typeof elt !== 'object') {
            fmt.endTag();
            fmt.closeTag(tag, elt);
        } else {
            if (elt.$) {
                Object.keys(elt.$).forEach(function(atb) {
                    let v;
                    if ((v = elt.$[atb]) != null) fmt.addAttribute(atb, v);
                });
            }
            const keys = Object.keys(elt).filter(function(key) {
                return key[0] !== '$';
            });
            if (elt.$value !== undefined) {
                if (keys.length > 0) throw error('cannot mix $value and $children');
                if (elt.$cdata) throw error('cannot mix $value and $cdata');
                if (elt.$value === null) {
                    fmt.addAttribute('xsi:nil', 'true');
                    fmt.endTag(true);
                } else {
                    fmt.endTag();
                    fmt.closeTag(tag, elt.$value);
                }
            } else if (elt.$cdata != null) {
                if (keys.length > 0) throw error('cannot mix $cdata and $children');
                fmt.endTag();
                fmt.cdata(elt.$cdata);
                fmt.closeTag(tag);
            } else if (keys.length > 0) {
                fmt.endTag();
                keys.forEach(function(key) {
                    strfy(elt[key], key);
                });
                fmt.closeTag(tag);
            } else {
                fmt.endTag(true);
            }
        }
    }
    const keys = Object.keys(elt);
    if (keys.length !== 1) throw error('bad root element expected 1 child got ' + keys.length);
    strfy(elt[keys[0]], keys[0]);
    return fmt.getResult();
}

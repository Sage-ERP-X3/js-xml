
# Simple XML parser and formatter

Transforms back and forth between XML and JS.
Tries to generate a JS object which is as simple as possible, without losing information.

Uses the following rules when converting from XML to JS:
* all values are returned as strings. No attempt to convert numbers and booleans
* attributes are mapped to a `$` subobject.
* simple values are mapped to an object with a `$value` property if the tag has attributes. 
* simple values are mapped to a string if the tag does not have attributes.
* repeating tags are mapped to an array.
* CDATA sections are mapped to an object with a `$cdata` property.
* self-closing tags are returned as an empty object.

Some examples:

```
<a>hello world</a>  --> { a: "hello world" }
<a x="hello">world</a>  --> { a: { $: { x: "hello" }, $value: "world" } }
<a><b>hello</b><c>world</c></a>  --> { a: { b : "hello", c: "world" } }
<a><b>hello</b><b>world</b></a>  --> { a: { b : ["hello", "world"] }
<a></a>  --> { a: "" }
<a/>  --> { a: {} }
```

See the `test/common/js-xml-test.js` unit test for more examples.

## API

`var jsxml = require('js-xml')`  

* `obj = jsxml.parse(xml)`  
  Parses an xml string and returns a JS object.  
  The returned object has a single property named after the root tag.  
  See examples above.
* `obj2 = jsxml.normalizeNamespaces(obj)`
  returns an object which has similar structure as the incoming object (obtained by `parse` function).
  namespaces will be attached to the tags, e. g. a tag "ns:tag" where "ns" is declared as namespace "http://x.y.z", will be transformed to "http://x.y.z|tag". Namespace declarations will be removed.


* `xml = jsxml.stringify(obj[, options])`  
  Formats a JS object in XML.  
  The object must have a single property which will give its name to the root tag.  
  `options` lets you specify the indentation, either as a string (`'\t'` for example),
  or as an { indent: '\t' } object. The second form may be used to introduce more options later.

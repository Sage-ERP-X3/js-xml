"use strict";
QUnit.module(module.id);

var jsxml = require("../..");
var revivers = require("../../lib/revivers");

function parseTest(xml, js, skipRT) {
	deepEqual(jsxml.parse(xml), js, "parse " + xml);
	if (!skipRT) strictEqual(jsxml.stringify(jsxml.parse(xml)), xml, "roundtrip " + xml);
}

function parseNsTest(xml, js) {
	deepEqual(jsxml.normalizeNamespaces(jsxml.parse(xml)), js, "parse (with namespaces) " + xml);
}

function rtTest(name, xml, indent, result) {
	strictEqual(jsxml.stringify(jsxml.parse(xml), {
		indent: indent
	}), result || xml, name);
}

function reviverTest(xml, js, reviver) {
	deepEqual(jsxml.parse(xml, reviver), js, "revive " + xml);
}

test('simple tag without attributes', 6, function() {
	parseTest('<a/>', {
		a: {}
	});
	parseTest('<a></a>', {
		a: ""
	});
	parseTest('<a>5</a>', {
		a: "5"
	});
});
test('simple tag with attributes', 10, function() {
	parseTest('<a x="3" y="4">5</a>', {
		a: {
			$: {
				x: "3",
				y: "4"
			},
			$value: "5"
		}
	});
	parseTest('<a x="3"></a>', {
		a: {
			$: {
				x: "3"
			},
			$value: ""
		}
	});
	parseTest('<a x="3"/>', {
		a: {
			$: {
				x: "3"
			},
		}
	});
	parseTest('<a> &#x0d;&#x0a;&#x09;</a>', {
		a: " \r\n\t"
	});
	parseTest('<a x="3"> &#x0d;&#x0a;&#x09;</a>', {
		a: {
			$: {
				x: "3"
			},
			$value: " \r\n\t"
		}
	});
});

test('entities', 4, function() {
	parseTest('<a x="a&gt;b&apos;c&lt;"/>', {
		a: {
			$: {
				x: "a>b'c<"
			},
		}
	});
	parseTest('<a>a&gt;b&apos;c&lt;</a>', {
		a: "a>b'c<"
	});
});
test('children', 6, function() {
	parseTest('<a><b>3</b><c>4</c></a>', {
		a: {
			b: "3",
			c: "4"
		}
	});
	parseTest('<a><b x="2">3</b><c>4</c></a>', {
		a: {
			b: {
				$: {
					x: "2"
				},
				$value: "3"
			},
			c: "4"
		}
	});
	parseTest('<a><b>3</b><b>4</b><c>5</c></a>', {
		a: {
			b: ["3", "4"],
			c: "5"
		}
	});
});

test('cdata', 4, function() {
	parseTest('<a><![CDATA[<abc>]]></a>', {
		a: {
			$cdata: "<abc>"
		}
	});
	parseTest('<a><![CDATA[]]></a>', {
		a: {
			$cdata: ""
		}
	});
});

test('comments in text', 1, function() {
	parseTest('<a>abc <!-- <b>def</b> --> ghi</a>', {
		a: "abc  ghi"
	}, true);
});

test('reformatting', 7, function() {
	rtTest('spaces outside', ' \r\n\t <a/> \t', null, '<a/>');
	rtTest('spaces inside tag', '<a  x="v1"y="v2"\t/>', null, '<a x="v1" y="v2"/>');
	rtTest('spaces around children', '<a> <b />\n<c\n/>\t</a>', null, '<a><b/><c/></a>');
	rtTest('spaces and cdata', '<a> \n<![CDATA[ <abc>\n\t]]>\t</a>', null, '<a><![CDATA[ <abc>\n\t]]></a>');
	rtTest('spaces in value', '<a> </a>', null, '<a> </a>');
	rtTest('more spaces in value', '<a> \r\n\t</a>', null, '<a> &#x0d;&#x0a;&#x09;</a>');
	rtTest('indentation', '<a><b x="3">5</b><c><d/></c></a>', '\t', '<a>\n\t<b x="3">5</b>\n\t<c>\n\t\t<d/>\n\t</c>\n</a>');
});

test('empty element in list', 1, function() {
	parseTest('<a><b></b><b>x</b><b></b></a>', {
		a: {
			b: ["", "x", ""]
		}
	}, true);
});


test('namespace transformation', 7, function() {
	parseNsTest('<a/>', {
		a: {}
	});
	parseNsTest('<t:a xmlns:t="xyz"></t:a>', {
		"xyz|a": ""
	});
	parseNsTest('<t:a xmlns:t="xyz" />', {
		"xyz|a": {}
	});
	parseNsTest('<a xmlns="abc" x="3" y="4">5</a>', {
		"abc|a": {
			$: {
				x: "3",
				y: "4"
			},
			$value: "5"
		}
	});
	parseNsTest('<a xmlns="abc" t:x="3" y="4" xmlns:t="xyz"><b><c xmlns="def"/></b></a>', {
		"abc|a": {
			$: {
				"xyz|x": "3",
				y: "4"
			},
			"abc|b": {
				"def|c": {}
			}
		}
	});
	parseNsTest('<t:a xmlns="abc" t:x="3" y="4" xmlns:t="xyz"><b><t:c xmlns="def">55</t:c></b><v:d xmlns:v="ddd" t:y="7" /></t:a>', {
		"xyz|a": {
			$: {
				"xyz|x": "3",
				y: "4"
			},
			"abc|b": {
				"xyz|c": "55"
			},
			"ddd|d": {
				$: {
					"xyz|y": "7"
					
				}
			}
		}
	});
	parseNsTest('<t xmlns:x="abc"><a xmlns="abc">1</a><x:a>2</x:a><a xmlns="def">3</a><a xmlns="abc">4</a></t>', {"t": {
		"abc|a": [ "1", "4", "2"],
		"def|a": "3"
	}});
});


test('simplify', 1, function() {
	reviverTest('<a atb1="x"><b atb2="y">3</b><c>4</c><c y="3">5</c><c xsi:nil="true"/></a>', {
		a: {
			b: "3",
			c: ["4", "5", null]
		}
	}, revivers.simplify);
});
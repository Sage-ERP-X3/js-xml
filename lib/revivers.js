"use strict";

exports.simplify = function(key, val) {
	if (!val) return val;
	if (val.$ && val.$['xsi:nil'] === 'true') return null;
	if (val.$value != null) return val.$value;
	if (val.$cdata != null) return val.$cdata;
	delete val.$;
	return typeof val === "object" ? Object.keys(val).length > 0 ? val : null : val;
};


if (typeof(''.bgDefault) !== 'function') {
	require('tinycolor');
}

var util = require('util');
var pkgLookup = require('package-lookup');
var nodeVersion = process.version.replace(/^v/, '');

function underscoreName(identifier) {
	return identifier.replace(/[A-Z][a-z]+/g, function(part) {
		return '_' + part;
	}).replace(/[\s\-_]+/g, '_').replace(/^_|_$/g, '').toLowerCase();
}

function inheritError(Child, Parent) {
	Child.prototype = new Parent();
	Object.defineProperty(Child.prototype, 'constructor', { value: Child });
	Object.defineProperty(Child.prototype, 'name', { value: Child.name });
}

function lookupPackage(filename) {
	if (/^\//.test(filename)) {
		var pkg = pkgLookup.resolve(filename);
		if (pkg) {
			return {
				name: ('' + [pkg.name]) || null,
				version: ('' + [pkg.version]) || null,
				_dirname: ('' + [pkg._dirname]) || null
			};
		}
	} else if (filename) {
		return {
			name: 'node',
			version: nodeVersion
		};
	}
	return null;
}

function originJSON(origin) {
	origin = '' + [origin];
	var matches = origin.match(/^(.+?)\((.+)\)$/);
	if (matches) {
		var id = matches[1].trim().split(' at ');
		var invocation = id[0].trim();
		var name = null;
		if (id.length >= 2) {
			name = id[1].trim();
			if (name === '<anonymous>') {
				name = null;
			}
		}

		var nestedOrigin = originJSON(matches[2]);
		var result = {
			invocation: invocation,
			name: name,
			origin: null
		};

		if (nestedOrigin.invocation) {
			result.origin = nestedOrigin;
		} else {
			result = util._extend(result, nestedOrigin);
		}

		return result;
	}

	matches = origin.match(/^(.+):(\d+):(\d+)$/);
	if (matches) {
		return {
			pkg: lookupPackage(matches[1]),
			filename: matches[1],
			line: matches[2] | 0,
			column: matches[3] | 0
		};
	}

	return {
		name: origin
	};
}

function frameJSON(frame) {
	var invocation;
	if (frame.isToplevel()) {
		invocation = 'toplevel';
	} else if (frame.isEval()) {
		invocation = 'eval';
	} else if (frame.isNative()) {
		invocation = 'native';
	} else if (frame.isConstructor()) {
		invocation = 'constructor';
	} else {
		invocation = 'function';
	}

	var typeName = frame.getTypeName();
	if (invocation === 'toplevel' && typeName === 'Object') {
		typeName = null;
	}

	var funcName = frame.getFunctionName();
	var methodName = frame.getMethodName();
	if (typeName) {
		if (funcName) {
			if (funcName.substring(0, typeName.length + 1) === typeName + '.') {
				typeName += funcName.substring(typeName.length);
			} else {
				typeName += '.' + funcName;
			}
		} else if (methodName) {
			typeName += '.' + methodName;
		} else {
			typeName += '.<anonymous>';
		}
	} else {
		typeName = funcName || methodName || null;
	}

	var filename = frame.getFileName() || null;
	var origin = frame.getEvalOrigin();
	if (origin === filename) {
		origin = null;
	} else {
		origin = originJSON(origin);
	}

	return {
		pkg: lookupPackage(filename),
		invocation: invocation,
		name: typeName,
		filename: filename,
		line: frame.getLineNumber(),
		column: frame.getColumnNumber(),
		origin: origin
	};
}

Object.defineProperty(Error.prototype, 'toJSON', {
	value: function ErrorToJSON() {
		var name = ('' + [this.name]) || 'Error';

		var self = {
			error: underscoreName(name)
		};
		if (this.message) {
			self.error_description = '' + this.message;
		}

		var cause = typeof(this.cause) === 'object' ? this.cause : null;

		var data = null;
		for (var property in this) {
			if (!((property === 'cause' && cause) ||
					property === 'name' ||
					property === 'message' ||
					property === 'stack')) {
				var value = this[property];
				if (typeof(value) !== 'function') {
					data = data || {};
					data[property] = value;
				}
			}
		}
		if (data) {
			self.error_data = data;
		}

		if (cause && typeof(cause.toJSON) === 'function') {
			self.error_cause = cause.toJSON();
		}

		var callSite = this.callSite;
		if (Array.isArray(callSite)) {
			self.error_stack = callSite.map(frameJSON);
		}

		return self;
	}
});

function Ferro(message) {
	Error.apply(this, arguments);
	this.message = message;
}
inheritError(Ferro, Error);
Ferro.prototype.toString = function() {
	var name = ('' + [this.name]) || 'Ferro';
	var message = '' + [this.message];
	return '[' + name + (message ? ': ' + message : '') + ']';
};

var classes = {
	Ferro: Ferro,
	Error: Error,
	EvalError: EvalError,
	RangeError: RangeError,
	ReferenceError: ReferenceError,
	SyntaxError: SyntaxError,
	TypeError: TypeError,
	URIError: URIError
};

function getClass(name) {
	name = ('' + [name]) || 'Error';
	var ErrorClass = classes[name];
	if (!ErrorClass) {
		var code =
			'return function ' + name + '(message) {\n' +
			'\tFerro.apply(this, arguments);\n' +
			'};';
		classes[name] = ErrorClass = new Function('Ferro', code)(Ferro);
		inheritError(ErrorClass, Ferro);
	}
	return ErrorClass;
}

function createError(name, params) {
	var message;
	if (typeof(params) === 'string') {
		message = params;
		params = undefined;
	}
	if (params && 'message' in params) {
		message = ('' + [params.message]) || undefined;
		params = util._extend({}, params);
		delete params.message;
	}

	var ErrorClass = getClass(name);
	var error = message ? new ErrorClass(message) : new ErrorClass();
	util._extend(error, params);
	return error;
}

function formatJSONOrigin(origin) {
	var text = '';

	if (origin.origin) {
		if (origin.origin.invocation) {
			text = origin.origin.invocation + ' at ' +
				(origin.origin.name || '<anonymous>');
		}
		text += ' (' + formatJSONOrigin(origin.origin) + ')';
	}

	if (origin.filename !== undefined) {
		if (text) {
			text += ', ';
		}

		var filename = '' + [origin.filename];
		var pkg = origin.pkg;
		if (pkg &&
				pkg._dirname &&
				pkg._dirname.length < filename.length &&
				filename.substring(0, pkg._dirname.length) === pkg._dirname) {
			filename = filename.substring(pkg._dirname.length);
		}

		if (pkg) {
			text += pkg.name + '@' + pkg.version + ' ';
		}

		text += filename || '<anonymous>';
		if (origin.line) {
			text += ':' + origin.line;
			if (origin.column) {
				text += ':' + origin.column;
			}
		}
	}

	return text;
}

function formatJSONStack(frames, options) {
	return frames.map(function(frame) {
		var filename = frame.filename;
		var pkg = frame.pkg;
		if (pkg &&
				pkg._dirname &&
				pkg._dirname.length < filename.length &&
				filename.substring(0, pkg._dirname.length) === pkg._dirname) {
			filename = filename.substring(pkg._dirname.length);
		}
		return '    at' +
			(frame.name ? (' ' + frame.name).yellow : '') + ' ' +
			((frame.name ? '(' : '') +
				formatJSONOrigin(frame) +
				(frame.name ? ')' : '')).grey;
	}).join('\n');
}

function formatStack(error, options) {
	var isArray = Array.isArray(error);
	var data = util._extend(isArray ? [] : {}, error);
	var name;
	var message;
	var stack = '';
	var stackFirstAt;

	if (error instanceof Error) {
		delete data.name;
		delete data.message;
		name = error.name;
		message = error.message;
		stack = error.toJSON().error_stack;
		if (Array.isArray(stack)) {
			stack = formatJSONStack(stack, options);
		} else {
			stack = '' + [error.stack];
			stackFirstAt = stack.match(/\n.* +at +/);
			if (stackFirstAt) {
				stack = stack.substring(stackFirstAt.index + 1);
			}
		}
	} else if (typeof(error) === 'object') {
		if (error.error) {
			name = error.error;
			delete data.error;
		} else if (error.name) {
			name = error.name;
			delete data.name;
		}

		if (error.error_description) {
			message = error.error_description;
			delete data.error_description;
		} else if (error.message) {
			message = error.message;
			delete data.message;
		}

		name = name || (isArray ? 'Error array' : 'Error object');
		if (isArray && data.length === 0) {
			data = null;
		}

		if (typeof(error.stack) === 'string') {
			stack = '' + [error.stack];
			stackFirstAt = stack.match(/\n.* +at +/);
			if (stackFirstAt) {
				stack = stack.substring(stackFirstAt.index + 1);
				delete data.stack;
			} else {
				stack = '';
			}
		}
	} else {
		name = 'Error value';
		message = '' + error;
		data = null;
	}

	var cause = data.cause;
	if (typeof(cause) === 'object') {
		delete data.cause;
	} else {
		cause = null;
	}

	name = ('' + [name]).trim() || 'Error object';
	message = ('' + [message]).trim();
	if (message) {
		name += ': ';
	}

	var text = name.cyan + (message ? message.bold : '');
	if (data) {
		data = util.format(data);
		if (data !== '{}') {
			text += '\n' + data.replace(/^/mg, '    ').grey;
		}
	}
	if (stack) {
		text += '\n' + stack;
	}
	if (cause) {
		text += '\ncaused by ' + formatStack(cause, options);
	}
	return text;
}

var ferro = createError;
ferro.getClass = getClass;
ferro.stack = formatStack;
module.exports = ferro;

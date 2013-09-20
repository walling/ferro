
var util = require('util');

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

		return {
			invocation: invocation,
			name: name,
			origin: originJSON(matches[2])
		};
	}

	matches = origin.match(/^(.+):(\d+):(\d+)$/);
	if (matches) {
		return {
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
			if (!(property === 'name' || property === 'message' ||
					(property === 'cause' && cause))) {
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

		if (cause) {
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

var ferro = createError;
ferro.getClass = getClass;
module.exports = ferro;

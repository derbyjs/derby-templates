var operatorFns = require('./operatorFns');
var serializeObject = require('serialize-object');

exports.lookup = lookup;
exports.templateTruthy = templateTruthy;
exports.ExpressionMeta = ExpressionMeta;

exports.Expression = Expression;
exports.LiteralExpression = LiteralExpression;
exports.PathExpression = PathExpression;
exports.BracketsExpression = BracketsExpression;
exports.FnExpression = FnExpression;
exports.OperatorExpression = OperatorExpression;
exports.NewExpression = NewExpression;
exports.SequenceExpression = SequenceExpression;

function lookup(segments, value) {
  if (!segments) return value;

  for (var i = 0, len = segments.length; i < len; i++) {
    if (value == null) return value;
    value = value[segments[i]];
  }
  return value;
}

// Truthy values are based on Handlebars:
// http://handlebarsjs.com/#conditionals
// https://github.com/wycats/handlebars.js/blob/master/lib/handlebars/utils.js#L72
// Unlike JS, `[]` is falsey and `0` is truthy
function templateTruthy(value) {
  return !(
    (!value && value !== 0) ||
    (Array.isArray(value) && value.length === 0)
  );
}

function ExpressionMeta(source, blockType, isEnd, as, unescaped, bindType, valueType) {
  this.source = source;
  this.blockType = blockType;
  this.isEnd = isEnd;
  this.as = as;
  this.unescaped = unescaped;
  this.bindType = bindType;
  this.valueType = valueType;
}
ExpressionMeta.prototype.module = 'expressions';
ExpressionMeta.prototype.type = 'ExpressionMeta';
ExpressionMeta.prototype.serialize = function() {
  return serializeObject.instance(
    this
  , this.source
  , this.blockType
  , this.isEnd
  , this.as
  , this.unescaped
  , this.bindType
  , this.valueType
  );
};

function Expression(meta) {
  this.meta = meta;
}
Expression.prototype.module = 'expressions';
Expression.prototype.type = 'Expression';
Expression.prototype.serialize = function() {
  return serializeObject.instance(this, this.meta);
};
Expression.prototype.toString = function() {
  return this.meta && this.meta.source;
};
Expression.prototype.truthy = function(context) {
  var blockType = this.meta.blockType;
  if (blockType === 'else') return true;
  var value = templateTruthy(this.get(context));
  return (blockType === 'unless') ? !value : value;
};
Expression.prototype.get = function(context) {
  return context.get();
};
// Resolve returns the expression's segment list in a context.
Expression.prototype.resolve = function() {};
// Dependancies returns a list of Dependancy objects for this expression, or null.
Expression.prototype.dependencies = function() {};

function LiteralExpression(value, meta) {
  this.value = value;
  this.meta = meta;
}
LiteralExpression.prototype = new Expression();
LiteralExpression.prototype.type = 'LiteralExpression';
LiteralExpression.prototype.serialize = function() {
  return serializeObject.instance(this, this.value, this.meta);
};
LiteralExpression.prototype.get = function(context) {
  return getPatch(this, context, this.value);
};

function PathExpression(segments, relative, meta) {
  this.segments = segments;
  this.relative = relative;
  this.meta = meta;

  var alias, attribute;
  var firstSegment = segments && segments[0];
  var firstChar = (typeof firstSegment === 'string') && firstSegment.charAt(0);
  if (firstChar === '#') {
    alias = firstSegment;
    segments.shift();
  } else if (firstChar === '@') {
    attribute = firstSegment.slice(1);
    segments.shift();
  }
  this.alias = alias;
  this.attribute = attribute;
}
PathExpression.prototype = new Expression();
PathExpression.prototype.type = 'PathExpression';
PathExpression.prototype.serialize = function() {
  var segments = this.segments.slice();
  if (this.alias) segments.unshift(this.alias);
  if (this.attribute) segments.unshift('@' + this.attribute);
  return serializeObject.instance(this, segments, this.relative, this.meta);
};

PathExpression.prototype.get = function(context) {
  if (this.relative) {
    var value = (this.meta && this.meta.blockType) ?
      context.parent.get() :
      context.get();
    value = lookup(this.segments, value);
    return getPatch(this, context, value);

  } else if (this.alias) {
    var value = context.forAlias(this.alias).get();
    value = lookup(this.segments, value);
    return getPatch(this, context, value);

  } else if (this.attribute) {
    var attributeContext = context.forAttribute(this.attribute);
    var value = attributeContext && attributeContext.attributes[this.attribute];
    value = lookup(this.segments, value);
    return getPatch(this, context, value);

  } else {
    var value = lookup(this.segments, context.controller.model.data);
    return getPatch(this, context, value);
  }
};

// Resolve returns a segment list at which the expression's value can be found.
// The segment list contains references to contexts in place of numbers when
// floating item numbers are involved.
PathExpression.prototype.resolve = function(context) {
  if (this.relative) {
    if (context.expression) {
      var base = context.expression.resolve(context);
      return base && base.concat(this.segments);
    }
    return this.segments;

  } else if (this.alias) {
    var aliasContext = context.forAlias(this.alias);
    var base = aliasContext.expression.resolve(aliasContext);
    return base && base.concat(this.segments);

  } else if (this.attribute) {
    var attributeContext = context.forAttribute(this.attribute);
    var base = attributeContext &&
      attributeContext.attributes[this.attribute].resolve(attributeContext);
    return base && base.concat(this.segments);

  } else {
    return resolvePatch(this, context, this.segments);
  }
};
PathExpression.prototype.dependencies = function(context) {
  // PathExpressions don't naturally have any dependancies, but if we're an
  // alias or relative path, we need to return any dependancies which make up
  // our ancestor (eg, {{ with foo[bar] }} ... {{ this.x }} has 'bar' as a
  // dependancy.
  if (this.relative && context.expression) {
    return context.expression.dependancies(context);
  } else if (this.alias) {
    var alias = context.forAlias(this.alias);
    return alias.expression.dependancies(alias);
  }
};
PathExpression.prototype.set = function(context, value) {
  var segments = this.resolve(context);
  // TODO: Make set method accept segments as well as path
  context.controller.model.set(segments.join('.'), value);
};

function BracketsExpression(before, inside, afterSegments, meta) {
  this.before = before;
  this.inside = inside;
  this.afterSegments = afterSegments;
  this.meta = meta;
}
BracketsExpression.prototype = new Expression();
BracketsExpression.prototype.type = 'BracketsExpression';
BracketsExpression.prototype.serialize = function() {
  return serializeObject.instance(this, this.before, this.inside, this.afterSegments, this.meta);
};
BracketsExpression.prototype.get = function(context) {
  var inside = this.inside.get(context);
  if (inside == null) return;
  var before = this.before.get(context);
  if (!before) return;
  var base = before[inside];
  var value = (this.afterSegments) ? lookup(this.afterSegments, base) : base;
  return getPatch(this, context, value);
};
BracketsExpression.prototype.resolve = function(context) {
  // Get and split the current value of the expression inside the brackets
  var inside = this.inside.get(context);
  if (inside == null) return;

  // Concat the before, inside, and optional after segments
  var segments = this.before.resolve(context);
  if (!segments) return;
  var segments = (this.afterSegments) ?
    segments.concat(inside, this.afterSegments) :
    segments.concat(inside);
  return resolvePatch(this, context, segments);
};
BracketsExpression.prototype.dependencies = function(context, forInnerPath) {
  /*
  var insideDependencies = this.inside.dependencies(context);
  var dependencies = (forInnerPath) ?
    insideDependencies :
    [this.resolve(context)].concat(insideDependencies);
  var beforeDependencies = this.before.dependencies(context, true);
  return (beforeDependencies) ?
    dependencies.concat(beforeDependencies) :
    dependencies;
  */
};
BracketsExpression.prototype.set = function(context, value) {
  var segments = this.resolve(context);
  // TODO: Make set method accept segments as well as path
  context.controller.model.set(segments.join('.'), value);
};

function FnExpression(segments, args, afterSegments, meta) {
  this.segments = segments;
  this.args = args;
  this.afterSegments = afterSegments;
  this.meta = meta;
  var parentSegments = segments && segments.slice();
  this.lastSegment = parentSegments && parentSegments.pop();
  this.parentSegments = (parentSegments && parentSegments.length) ? parentSegments : null;
}
FnExpression.prototype = new Expression();
FnExpression.prototype.type = 'FnExpression';
FnExpression.prototype.serialize = function() {
  return serializeObject.instance(this, this.segments, this.args, this.afterSegments, this.meta);
};
FnExpression.prototype.get = function(context) {
  var value = this.apply(context);
  // Lookup property underneath computed value if needed
  if (this.afterSegments) {
    value = lookup(this.afterSegments, value);
  }
  return getPatch(this, context, value);
};
FnExpression.prototype.apply = function(context, extraInputs) {
  var controller = context.controller;
  var fn;
  while (controller) {
    var parent = (this.parentSegments) ?
      lookup(this.parentSegments, controller) :
      controller;
    var fn = parent && parent[this.lastSegment];
    if (fn) break;
    controller = controller.parent;
  }
  var getFn = (fn && fn.get) || fn;
  if (!fn) throw new Error('Function not found for: ' + this.segments.join('.'));
  return this._applyFn(getFn, context, extraInputs, parent);
};
FnExpression.prototype._getInputs = function(context) {
  var inputs = [];
  for (var i = 0, len = this.args.length; i < len; i++) {
    inputs.push(this.args[i].get(context));
  }
  return inputs;
};
FnExpression.prototype._applyFn = function(fn, context, extraInputs, thisArg) {
  // Apply if there are no path inputs
  if (!this.args) {
    return (extraInputs) ?
      fn.apply(thisArg, extraInputs) :
      fn.call(thisArg);
  }
  // Otherwise, get the current value for path inputs and apply
  var inputs = this._getInputs(context);
  if (extraInputs) {
    for (var i = 0, len = extraInputs.length; i < len; i++) {
      inputs.push(extraInputs[i]);
    }
  }
  return fn.apply(thisArg, inputs);
};
FnExpression.prototype.dependencies = function(context) {
  /*
  var dependencies = [];
  if (!this.args) return dependencies;
  for (var i = 0, len = this.args.length; i < len; i++) {
    var argDependencies = this.args[i].dependencies(context);
    var firstDependency = argDependencies && argDependencies[0];
    if (!firstDependency) continue;
    if (firstDependency[firstDependency.length - 1] !== '*') {
      argDependencies[0] = argDependencies[0].concat('*');
    }
    for (var j = 0, jLen = argDependencies.length; j < jLen; j++) {
      dependencies.push(argDependencies[j]);
    }
  }
  return dependencies;
  */
};
FnExpression.prototype.set = function(context, value) {
  // TODO
};

function NewExpression(segments, args, afterSegments, meta) {
  FnExpression.call(this, segments, args, afterSegments, meta);
}
NewExpression.prototype = new FnExpression();
NewExpression.prototype.type = 'NewExpression';
NewExpression.prototype._applyFn = function(fn, context) {
  // Apply if there are no path inputs
  if (!this.args) return new fn();
  // Otherwise, get the current value for path inputs and apply
  var inputs = this._getInputs(context);
  inputs.unshift(null);
  return new (fn.bind.apply(fn, inputs))();
};

function OperatorExpression(name, args, afterSegments, meta) {
  this.name = name;
  this.args = args;
  this.afterSegments = afterSegments;
  this.meta = meta;
  this.getFn = operatorFns.get[name];
}
OperatorExpression.prototype = new FnExpression();
OperatorExpression.prototype.type = 'OperatorExpression';
OperatorExpression.prototype.serialize = function() {
  return serializeObject.instance(this, this.name, this.args, this.afterSegments, this.meta);
};
OperatorExpression.prototype.apply = function(context) {
  return this._applyFn(this.getFn, context);
};

function SequenceExpression(args, afterSegments, meta) {
  this.args = args;
  this.afterSegments = afterSegments;
  this.meta = meta;
}
SequenceExpression.prototype = new OperatorExpression();
SequenceExpression.prototype.type = 'SequenceExpression';
SequenceExpression.prototype.serialize = function() {
  return serializeObject.instance(this, this.args, this.afterSegments, this.meta);
};
SequenceExpression.prototype.name = ',';
SequenceExpression.prototype.getFn = operatorFns.get[','];
SequenceExpression.prototype.resolve = function(context) {
  var last = this.args[this.args.length - 1];
  return last.resolve(context);
};
SequenceExpression.prototype.dependencies = function(context) {
  var last = this.args[this.args.length - 1];
  return last.dependencies(context);
};

function getPatch(expression, context, value) {
  return (context && expression === context.expression && context.item != null) ?
    value && value[context.item] :
    value;
}

function resolvePatch(expression, context, segments) {
  return (context && expression === context.expression && context.item != null) ?
    segments.concat(context) :
    segments;
}

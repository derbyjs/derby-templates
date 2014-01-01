var operatorFns = require('./operatorFns');
var serializeObject = require('serialize-object');

exports.lookup = lookup;
exports.templateTruthy = templateTruthy;
exports.pathSegments = pathSegments;
exports.ExpressionMeta = ExpressionMeta;

exports.Expression = Expression;
exports.LiteralExpression = LiteralExpression;
exports.PathExpression = PathExpression;
exports.RelativePathExpression = RelativePathExpression;
exports.AliasPathExpression = AliasPathExpression;
exports.AttributePathExpression = AttributePathExpression;
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

function ExpressionMeta(source, blockType, isEnd, as, keyAs, unescaped, bindType, valueType) {
  this.source = source;
  this.blockType = blockType;
  this.isEnd = isEnd;
  this.as = as;
  this.keyAs = keyAs;
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
  , this.keyAs
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
// Return the expression's segment list with context objects
Expression.prototype.resolve = function() {};
// Return a list of segment lists or null
Expression.prototype.dependencies = function() {};
// Return the pathSegments that the expression currently resolves to or null
Expression.prototype.pathSegments = function(context) {
  var segments = this.resolve(context);
  return segments && pathSegments(segments);
};
Expression.prototype.set = function(context, value) {
  var segments = this.pathSegments(context);
  if (!segments) throw new Error('Expression does not support setting');
  context.controller.model._set(segments, value);
};

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

function PathExpression(segments, meta) {
  this.segments = segments;
  this.meta = meta;
}
PathExpression.prototype = new Expression();
PathExpression.prototype.type = 'PathExpression';
PathExpression.prototype.serialize = function() {
  return serializeObject.instance(this, this.segments, this.meta);
};
PathExpression.prototype.get = function(context) {
  var value = lookup(this.segments, context.controller.model.data);
  return getPatch(this, context, value);
};
PathExpression.prototype.resolve = function(context) {
  var segments = concat(context.controller._scope, this.segments);
  return resolvePatch(this, context, segments);
};
PathExpression.prototype.dependencies = function(context, forInnerPath) {
  return outerDependency(this, context, forInnerPath);
};

function RelativePathExpression(segments, meta) {
  this.segments = segments;
  this.meta = meta;
}
RelativePathExpression.prototype = new Expression();
RelativePathExpression.prototype.type = 'RelativePathExpression';
RelativePathExpression.prototype.serialize = function() {
  return serializeObject.instance(this, this.segments, this.meta);
};
RelativePathExpression.prototype.get = function(context) {
  var relativeContext = context.forRelative(this);
  var value = relativeContext.get();
  value = lookup(this.segments, value);
  return getPatch(this, context, value);
};
RelativePathExpression.prototype.resolve = function(context) {
  var relativeContext = context.forRelative(this);
  var base = (relativeContext.expression) ?
    relativeContext.expression.resolve(relativeContext) :
    [];
  if (!base) return;
  var segments = base.concat(this.segments);
  return resolvePatch(this, context, segments);
};
RelativePathExpression.prototype.dependencies = function(context, forInnerPath) {
  // Return inner dependencies from our ancestor
  // (e.g., {{ with foo[bar] }} ... {{ this.x }} has 'bar' as a dependency.)
  var relativeContext = context.forRelative(this);
  var inner = relativeContext.expression &&
    relativeContext.expression.dependencies(relativeContext, true);
  var outer = outerDependency(this, context, forInnerPath);
  return concat(outer, inner);
};

function AliasPathExpression(alias, segments, meta) {
  this.alias = alias;
  this.segments = segments;
  this.meta = meta;
}
AliasPathExpression.prototype = new Expression();
AliasPathExpression.prototype.type = 'AliasPathExpression';
AliasPathExpression.prototype.serialize = function() {
  return serializeObject.instance(this, this.alias, this.segments, this.meta);
};
AliasPathExpression.prototype.get = function(context) {
  var aliasContext = context.forAlias(this.alias);
  if (aliasContext.keyAlias === this.alias) {
    return aliasContext.item;
  }
  var value = aliasContext.get();
  value = lookup(this.segments, value);
  return getPatch(this, context, value);
};
AliasPathExpression.prototype.resolve = function(context) {
  var aliasContext = context.forAlias(this.alias);
  if (aliasContext.keyAlias === this.alias) {
    // TODO
    return;
  }
  var base = aliasContext.expression.resolve(aliasContext);
  if (!base) return;
  var segments = base.concat(this.segments);
  return resolvePatch(this, context, segments);
};
AliasPathExpression.prototype.dependencies = function(context, forInnerPath) {
  var aliasContext = context.forAlias(this.alias);
  if (aliasContext.keyAlias === this.alias) {
    // TODO
    return;
  }
  var inner = aliasContext.expression.dependencies(aliasContext, true);
  var outer = outerDependency(this, context, forInnerPath);
  return concat(outer, inner);
};

function AttributePathExpression(attribute, segments, meta) {
  this.attribute = attribute;
  this.segments = segments;
  this.meta = meta;
}
AttributePathExpression.prototype = new Expression();
AttributePathExpression.prototype.type = 'AttributePathExpression';
AttributePathExpression.prototype.serialize = function() {
  return serializeObject.instance(this, this.attribute, this.segments, this.meta);
};
AttributePathExpression.prototype.get = function(context) {
  var attributeContext = context.forAttribute(this.attribute);
  if (!attributeContext) return;
  var value = attributeContext.attributes[this.attribute];
  value = lookup(this.segments, value);
  return getPatch(this, context, value);
};
AttributePathExpression.prototype.resolve = function(context) {
  var attributeContext = context.forAttribute(this.attribute);
  // Attributes are either a ParentWrapper or a literal value
  var value = attributeContext && attributeContext.attributes[this.attribute];
  var base = value && (typeof value.resolve === 'function') &&
    value.resolve(attributeContext);
  if (!base) return;
  var segments = base.concat(this.segments);
  return resolvePatch(this, context, segments);
};
AttributePathExpression.prototype.dependencies = function(context, forInnerPath) {
  var attributeContext = context.forAttribute(this.attribute);
  // Attributes are either a ParentWrapper or a literal value
  var value = attributeContext && attributeContext.attributes[this.attribute];
  var inner = value && (typeof value.dependencies === 'function') &&
    value.dependencies(attributeContext, true);
  var outer = outerDependency(this, context, forInnerPath);
  return concat(outer, inner);
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
  var base = this.before.resolve(context);
  if (!base) return;
  var segments = (this.afterSegments) ?
    base.concat(inside, this.afterSegments) :
    base.concat(inside);
  return resolvePatch(this, context, segments);
};
BracketsExpression.prototype.dependencies = function(context, forInnerPath) {
  var before = this.before.dependencies(context, true);
  var inner = this.inside.dependencies(context);
  var outer = outerDependency(this, context, forInnerPath);
  return concat(concat(outer, inner), before);
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
SequenceExpression.prototype.dependencies = function(context, forInnerPath) {
  var last = this.args[this.args.length - 1];
  return last.dependencies(context, forInnerPath);
};

function pathSegments(segments) {
  var result = [];
  for (var i = 0; i < segments.length; i++) {
    var segment = segments[i];
    result[i] = (typeof segment === 'object') ? segment.item : segment;
  }
  return result;
}

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

function outerDependency(expression, context, forInnerPath) {
  if (forInnerPath) return;
  return [expression.resolve(context)];
}

function concat(a, b) {
  if (!a) return b;
  if (!b) return a;
  return a.concat(b);
}

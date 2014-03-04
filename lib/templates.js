var saddle = require('saddle');
var serializeObject = require('serialize-object');

(function() {
  for (var key in saddle) {
    exports[key] = saddle[key];
  }
})();

exports.View = View;
exports.ViewInstance = ViewInstance;
exports.DynamicViewInstance = DynamicViewInstance;
exports.ParentWrapper = ParentWrapper;

exports.Views = Views;

exports.MarkupHook = MarkupHook;
exports.ElementOn = ElementOn;
exports.ComponentOn = ComponentOn;
exports.MarkupAs = MarkupAs;

exports.emptyTemplate = new saddle.Template([]);

// Add Template::resolve
saddle.Template.prototype.resolve = function() {}

// The Template::dependencies method is specific to how Derby bindings work,
// so extend all of the Saddle Template types here
saddle.Template.prototype.dependencies = function(context) {
  return getArrayDependencies(this.content, context);
};
saddle.Doctype.prototype.dependencies = function() {};
saddle.Text.prototype.dependencies = function() {};
saddle.DynamicText.prototype.dependencies = function(context) {
  return getDependencies(this.expression, context);
};
saddle.Comment.prototype.dependencies = function() {};
saddle.DynamicComment.prototype.dependencies = function(context) {
  return getDependencies(this.expression, context);
};
saddle.Element.prototype.dependencies = function(context) {
  var items = getMapDependencies(this.attributes, context);
  return getArrayDependencies(this.content, context, items);
};
saddle.Block.prototype.dependencies = function(context) {
  var items = getDependencies(this.expression, context);
  return getArrayDependencies(this.content, context, items);
};
saddle.ConditionalBlock.prototype.dependencies = function(context) {
  var items = getArrayDependencies(this.expressions, context);
  return getArrayOfArrayDependencies(this.contents, context, items);
};
saddle.EachBlock.prototype.dependencies = function(context) {
  var items = getDependencies(this.expression, context);
  items = getArrayDependencies(this.content, context, items);
  return getArrayDependencies(this.elseContent, context, items);
};
saddle.Attribute.prototype.dependencies = function() {};
saddle.DynamicAttribute.prototype.dependencies = function(context) {
  return getDependencies(this.expression, context);
};

function getArrayOfArrayDependencies(expressions, context, items) {
  if (!expressions) return items;
  for (var i = 0, len = expressions.length; i < len; i++) {
    items = getArrayDependencies(expressions[i], context, items);
  }
  return items;
}
function getArrayDependencies(expressions, context, items) {
  if (!expressions) return items;
  for (var i = 0, len = expressions.length; i < len; i++) {
    items = getDependencies(expressions[i], context, items);
  }
  return items;
}
function getMapDependencies(expressions, context, items) {
  if (!expressions) return items;
  for (var key in expressions) {
    items = getDependencies(expressions[key], context, items);
  }
  return items;
}
function getDependencies(expression, context, items) {
  var dependencies = expression && expression.dependencies(context);
  if (!dependencies) return items;
  for (var i = 0, len = dependencies.length; i < len; i++) {
    items || (items = []);
    items.push(dependencies[i]);
  }
  return items;
}

function ViewAttributesMap(source) {
  var items = source.split(/\s+/);
  for (var i = 0, len = items.length; i < len; i++) {
    this[items[i]] = true;
  }
}
function ViewArraysMap(source) {
  var items = source.split(/\s+/);
  for (var i = 0, len = items.length; i < len; i++) {
    var item = items[i].split('/');
    this[item[0]] = item[1] || item[0];
  }
}
function View(views, name, source, options) {
  this.views = views;
  this.name = name;
  this.source = source;
  this.options = options;

  var nameSegments = (this.name || '').split(':');
  var lastSegment = nameSegments.pop();
  this.namespace = nameSegments.join(':');
  this.registeredName = (lastSegment === 'index') ? this.namespace : this.name;

  this.attributesMap = options && options.attributes &&
    new ViewAttributesMap(options.attributes);
  this.arraysMap = options && options.arrays &&
    new ViewArraysMap(options.arrays);
  // The empty string is considered true for easier HTML attribute parsing
  this.unminified = options && (options.unminified || options.unminified === '');
  this.string = options && (options.string || options.string === '');
  this.template = null;
  this.componentFactory = null;
}
View.prototype = new saddle.Template();
View.prototype.type = 'View';
View.prototype.serialize = function(options) {
  var template = this.template || this._parse();
  return 'views.register(' + serializeObject.args([
      this.name
    , (options && options.minify) ? null : this.source
    , (hasKeys(this.options)) ? this.options : null
    ]) + ').template = ' + template.serialize() + ';';
};
View.prototype.get = function(context, unescaped) {
  if (this.componentFactory) context = this.componentFactory.init(context);
  var template = this.template || this._parse();
  return template.get(context, unescaped);
};
View.prototype.getFragment = function(context, binding) {
  if (this.componentFactory) context = this.componentFactory.init(context);
  var template = this.template || this._parse();
  var fragment = template.getFragment(context, binding);
  if (this.componentFactory) this.componentFactory.create(context);
  return fragment;
};
View.prototype.appendTo = function(parent, context) {
  if (this.componentFactory) context = this.componentFactory.init(context);
  var template = this.template || this._parse();
  template.appendTo(parent, context);
  if (this.componentFactory) this.componentFactory.create(context);
};
View.prototype.attachTo = function(parent, node, context) {
  if (this.componentFactory) context = this.componentFactory.init(context);
  var template = this.template || this._parse();
  var node = template.attachTo(parent, node, context);
  if (this.componentFactory) this.componentFactory.create(context);
  return node;
};
View.prototype.dependencies = function(context) {
  var template = this.template || this._parse();
  return template.dependencies(context);
};
// View.prototype._parse is defined in parsing.js, so that it doesn't have to
// be included in the client if templates are all parsed server-side
View.prototype._parse = function() {
  throw new Error('View parsing not available');
};

function ViewInstance(name, attributes, hooks) {
  this.name = name;
  this.attributes = attributes;
  this.hooks = hooks;
  this.view = null;
}
ViewInstance.prototype = new saddle.Template();
ViewInstance.prototype.type = 'ViewInstance';
ViewInstance.prototype.serialize = function() {
  return serializeObject.instance(this, this.name, this.attributes, this.hooks);
};
ViewInstance.prototype.get = function(context, unescaped) {
  var view = this._find(context);
  var viewContext = context.viewChild(view, this.attributes, this.hooks);
  return view.get(viewContext, unescaped);
};
ViewInstance.prototype.getFragment = function(context, binding) {
  var view = this._find(context);
  var viewContext = context.viewChild(view, this.attributes, this.hooks);
  return view.getFragment(viewContext, binding);
};
ViewInstance.prototype.appendTo = function(parent, context) {
  var view = this._find(context);
  var viewContext = context.viewChild(view, this.attributes, this.hooks);
  view.appendTo(parent, viewContext);
};
ViewInstance.prototype.attachTo = function(parent, node, context) {
  var view = this._find(context);
  var viewContext = context.viewChild(view, this.attributes, this.hooks);
  return view.attachTo(parent, node, viewContext);
};
ViewInstance.prototype.dependencies = function(context) {
  var view = this._find(context);
  var viewContext = context.viewChild(view, this.attributes, this.hooks);
  return view.dependencies(viewContext);
};
ViewInstance.prototype._find = function(context) {
  if (this.view) return this.view;
  var contextView = context.getView();
  var namespace = contextView && contextView.namespace;
  this.view = context.meta.views.find(this.name, namespace);
  if (!this.view) {
    var message = context.meta.views.findErrorMessage(this.name, contextView);
    throw new Error(message);
  }
  return this.view;
};

function DynamicViewInstance(nameExpression, attributes, hooks) {
  this.nameExpression = nameExpression;
  this.attributes = attributes;
  this.hooks = hooks;
  this.optional = attributes && attributes.optional;
}
DynamicViewInstance.prototype = new ViewInstance();
DynamicViewInstance.prototype.type = 'DynamicViewInstance';
DynamicViewInstance.prototype.serialize = function() {
  return serializeObject.instance(this, this.nameExpression, this.attributes, this.hooks);
};
DynamicViewInstance.prototype._find = function(context) {
  var name = this.nameExpression.get(context);
  var contextView = context.getView();
  var namespace = contextView && contextView.namespace;
  var view = context.meta.views.find(name, namespace);
  if (!view) {
    if (this.optional) return exports.emptyTemplate;
    var message = context.meta.views.findErrorMessage(name, contextView);
    throw new Error(message);
  }
  return view;
};

function ParentWrapper(template, expression) {
  this.template = template;
  this.expression = expression;
}
ParentWrapper.prototype = new saddle.Template();
ParentWrapper.prototype.type = 'ParentWrapper';
ParentWrapper.prototype.serialize = function() {
  return serializeObject.instance(this, this.template, this.expression);
};
ParentWrapper.prototype.get = function(context, unescaped) {
  return (this.expression || this.template).get(context.forViewParent(), unescaped);
};
ParentWrapper.prototype.getFragment = function(context, binding) {
  return this.template.getFragment(context.forViewParent(), binding);
};
ParentWrapper.prototype.appendTo = function(parent, context) {
  this.template.appendTo(parent, context.forViewParent());
};
ParentWrapper.prototype.attachTo = function(parent, node, context) {
  return this.template.attachTo(parent, node, context.forViewParent());
};
ParentWrapper.prototype.resolve = function(context) {
  return this.expression && this.expression.resolve(context.forViewParent());
};
ParentWrapper.prototype.dependencies = function(context) {
  return (this.expression || this.template).dependencies(context.forViewParent());
};

function ViewsMap() {}
function Views() {
  this.nameMap = new ViewsMap();
  this.elementMap = new ViewsMap();
}
Views.prototype.find = function(name, namespace) {
  var map = this.nameMap;

  // Exact match lookup
  var exactName = (namespace) ? namespace + ':' + name : name;
  var match = map[exactName];
  if (match) return match;

  // Relative lookup
  var segments = name.split(':');
  var nameSegmentsAmount = segments.length;
  if (namespace) segments = namespace.split(':').concat(segments);
  // Iterate through segments, leaving the {nameSegmentsAmount} segments and
  // removing the second to {nameSegmentsAmount} segment to traverse up the
  // namespaces. Decrease {nameSegmentsAmount} if not found and repeat again.
  while (nameSegmentsAmount > 0) {
    while (segments.length > nameSegmentsAmount) {
      segments.splice(-1 - nameSegmentsAmount, 1);
      var testName = segments.join(':');
      var match = map[testName];
      if (match) return match;
    }
    nameSegmentsAmount--;
  }
};
Views.prototype.register = function(name, source, options) {
  var mapName = name.replace(/:index$/, '');
  var view = this.nameMap[mapName];
  if (view) {
    // Recreate the view if it already exists. We re-apply the constructor
    // instead of creating a new view object so that references to object
    // can be cached after finding the first time
    var componentFactory = view.componentFactory;
    View.call(view, this, name, source, options);
    view.componentFactory = componentFactory;
  } else {
    view = new View(this, name, source, options);
  }
  this.nameMap[mapName] = view;
  if (options && options.element) this.elementMap[options.element] = view;
  return view;
};
Views.prototype.serialize = function(options) {
  var out = 'function(derbyTemplates, views) {' +
    'var expressions = derbyTemplates.expressions;' +
    'var templates = derbyTemplates.templates;';
  for (var name in this.nameMap) {
    out += this.nameMap[name].serialize(options);
  }
  return out + '}';
};
Views.prototype.findErrorMessage = function(name, contextView) {
  var names = Object.keys(this.nameMap);
  var message = 'Cannot find view "' + name + '" in' +
    [''].concat(names).join('\n  ') + '\n';
  if (contextView) {
    message += '\nWithin template "' + contextView.name + '":\n' + contextView.source;
  }
  return message;
};


function MarkupHook() {}
MarkupHook.prototype.module = saddle.Template.prototype.module;

function ElementOn(name, expression) {
  this.name = name;
  this.expression = expression;
}
ElementOn.prototype = new MarkupHook();
ElementOn.prototype.type = 'ElementOn';
ElementOn.prototype.serialize = function() {
  return serializeObject.instance(this, this.name, this.expression);
};
ElementOn.prototype.emit = function(context, element) {
  var expression = this.expression;
  element.addEventListener(this.name, function elementOnListener(event) {
    return expression.apply(context, null, {$event: event, $element: element});
  }, false);
};

function ComponentOn(name, expression) {
  this.name = name;
  this.expression = expression;
}
ComponentOn.prototype = new MarkupHook();
ComponentOn.prototype.type = 'ComponentOn';
ComponentOn.prototype.serialize = function() {
  return serializeObject.instance(this, this.name, this.expression);
};
ComponentOn.prototype.emit = function(context, component) {
  var expression = this.expression;
  component.on(this.name, function componentOnListener() {
    var args = arguments.length && Array.prototype.slice.call(arguments);
    return expression.apply(context, args);
  });
};

function MarkupAs(segments) {
  this.segments = segments;
  this.lastSegment = segments.pop();
}
MarkupAs.prototype = new MarkupHook();
MarkupAs.prototype.type = 'MarkupAs';
MarkupAs.prototype.serialize = function() {
  var segments = this.segments.concat(this.lastSegment);
  return serializeObject.instance(this, segments);
};
MarkupAs.prototype.emit = function(context, target) {
  var node = traverseAndCreate(context.controller, this.segments);
  node[this.lastSegment] = target;
};

function traverseAndCreate(node, segments) {
  var len = segments.length;
  if (!len) return node;
  for (var i = 0; i < len; i++) {
    var segment = segments[i];
    node = node[segment] || (node[segment] = {});
  }
  return node;
}

function hasKeys(value) {
  if (!value) return false;
  for (var key in value) {
    return true;
  }
  return false;
}

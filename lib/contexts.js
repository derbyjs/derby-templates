exports.ContextMeta = ContextMeta;
exports.Context = Context;

function ContextMeta(options) {
  this.onAdd = options.onAdd;
  this.onRemove = options.onRemove;
  this.views = options.views;
  this.idNamespace = options.idNamespace || '';
  this.idCount = 0;
}

function Context(meta, controller, parent, unbound, expression, item, view, attributes) {
  // Required properties //

  // Properties which are globally inherited for the entire page
  this.meta = meta;
  // The page or component. Must have a `model` property with a `data` property
  this.controller = controller;

  // Optional properties //

  // Containing context
  this.parent = parent;
  // Boolean set to true when bindings should be ignored
  this.unbound = unbound;
  // The expression for a block
  this.expression = expression;
  // Alias name for the given expression
  this.alias = expression && expression.meta.as;

  // For Context::eachChild
  // The index of the each at render time
  this.item = item;

  // For Context::viewChild
  // Reference to the current view
  this.view = view;
  // Attribute values passed to the view instance
  this.attributes = attributes;
}

Context.prototype.id = function() {
  var count = ++this.meta.idCount;
  return this.meta.idNamespace + '_' + count.toString(36);
};

Context.prototype.onAdd = function(binding) {
  this.meta.onAdd(binding);
};
Context.prototype.onRemove = function(binding) {
  this.meta.onRemove(binding);
};

Context.prototype.child = function(expression) {
  // Set or inherit the binding mode
  var blockType = expression.meta.blockType;
  var unbound = (blockType === 'unbound') ? true :
    (blockType === 'bound') ? false :
    this.unbound;
  return new Context(this.meta, this.controller, this, unbound, expression);
};

Context.prototype.componentChild = function(component) {
  return new Context(this.meta, component, this, this.unbound);
};

// Make a context for an item in an each block
Context.prototype.eachChild = function(index) {
  return new Context(this.meta, this.controller, this, this.unbound, this.expression, index);
};

Context.prototype.viewChild = function(view, attributes) {
  return new Context(this.meta, this.controller, this, this.unbound, null, null, view, attributes);
};

// Returns the closest context which defined the named alias
Context.prototype.forAlias = function(alias) {
  var context = this;
  while (context) {
    if (context.alias === alias) return context;
    context = context.parent;
  }
  throw new Error('Alias not found: ' + alias);
};

// Returns the closest containing context for a view attribute name or nothing
Context.prototype.forAttribute = function(attribute) {
  var context = this;
  while (context) {
    // Find the closest context associated with a view
    if (context.view) {
      var attributes = context.attributes;
      if (!attributes) return;
      if (attributes.hasOwnProperty(attribute)) return context;
      // If the attribute isn't found, but the attributes inherit, continue
      // looking in the next closest view context
      if (!attributes.inherit) return;
    }
    context = context.parent;
  }
};

Context.prototype.getView = function() {
  var context = this;
  while (context) {
    // Find the closest view
    if (context.view) return context.view;
    context = context.parent;
  }
};

// Returns the `this` value for a context
Context.prototype.get = function() {
  return (this.expression) ? this.expression.get(this) : this.controller.model.data;
};

exports.DependencyOptions = DependencyOptions;

function DependencyOptions(options) {
  this.ignoreTemplate = options && options.ignoreTemplate;
}
DependencyOptions.shouldIgnoreTemplate = function(template, options) {
  return (options) ? options.ignoreTemplate === template : false;
};

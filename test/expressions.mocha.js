var expect = require('expect.js');
var expressions = require('../lib/expressions');

describe('Expressions', function() {

  it('outerDepedency returns undefined if expression.resolve(context) returns undefined', function() {
    var expression = {
      resolve: function() {
        return;
      },
    };
    var context = {};
    var forInnerPath = false;
    expect(expressions._outerDependency(expression, context, forInnerPath)).equal(undefined);
  });

});

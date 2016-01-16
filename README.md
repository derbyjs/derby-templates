
# API

`derby-templates` exports four members:

 * a context api (`contexts`)
 * an expression api (`expressions`)
 * operator functions (`operatorFns`)
 * and a template api (`templates`)

Each of those are explained in the following sections.


## Contexts

The `contexts` member has two prototypes:

* `ContextMeta`
* `Context`

#### Context

A context used for  TODO

A context always has two properties:

* `meta`: properties which are globally inherited for the entire page
* `controller`: The page or component. Must have a `model` property with a `data` property.


Optionally, the following properties may be defined:

* `parent`: containing context
* `unbound`: boolean set to true when bindings should be ignored
* `expression`: the expression for a block
* `alias`: alias name for the given expression (`ExpressionMeta::as`)
* `keyAlias`: alias name for the index or iterated key (`ExpressionMeta::keyAs`)
* `item`: for `Context::eachChild`: the index of the `each` at render time

* for `Context::viewChild`:

    - `view`: reference to the current view
    - `attributes`: attribute values passed to the view instance
    - `hooks`: MarkupHooks to be called after insert into DOM of component
    - `initHooks`: MarkupHooks to be called immediately before init of component

* `_id`: used in `EventModel`



## Expressions

The `expressions` member has four functions:

* lookup
* templateTruthy
* pathSegments
* renderValue

and all possible expression prototypes:

* literals
* paths
* relative paths
* aliases
* attribute paths
* bracket expressions
* ...

See below for the details.


#### lookup
#### templateTruthy


#### pathSegments

Iterate through an array of segments and return a new array with each `segment`, or `segment.item` if available.

#### renderValue



#### `_outerDependency`


#### `ExpressionMeta`

In Derby, templates can contain expressions introduced by `{{ }}`. `ExpressionMeta` holds everything but the path of the
expression.

* `source`: the full original expression between `{{ }}`
* `blockType`: if the expression starts a block, one of: `if`, `else if`, `else`, `unless`, `each`, `bound`, `unbound`, `with`, `on`
* `isEnd`: `true` if it was an end tag (`{{/}}` or `{{/if}}`), `false` otherwise
* `as`: the name of the alias to be created; starts with `#` (e.g. `#alias` if expression ended with `as #alias`)
* `keyAs`: in case of `each ... as #v, #i`, this is name for the index key or iterated key, `#i` in this case
* `unescaped`:
* `bindType`:
* `valueType`:


#### Expression

Every expression inherits the `Expression` prototype.

TODO: serialize()


#### LiteralExpression

Represents any valid JavaScript literal expression. Examples:
```js
56.8e-4             // floating-point
"string"            // String
["arr", "ay"]       // Array
{ key: "value" }    // Object
true                // boolean
/a+b/               // RegExp
```



#### PathExpression

Represents a simple JSON path expression to lookup a value in an object hierarchy. Steps in the hierarchy are called
"segment" and are separated by a dot. Example:
```
_page.color
```

```js
new PathExpression(['_page', 'color'])
```



#### RelativePathExpression

Relative view paths begin with `this`. They refer to the expression in the containing block.

```
this.color
```

```js
new RelativePathExpression(['color'])
```


#### AliasPathExpression

Aliases label path expressions. They must begin with a hash (`#`) character to make it more obvious whether a path is an
alias or a model value. Each of the block types support defining aliases with the `as` keyword.

Aliases are more explicit than relative paths and make it possible to refer to the scope of a parent block.

```
#page.color
```

```js
new AliasPathExpression('#page', ['color'])
```

#### AttributePathExpression

Views can be passed values as attributes. These attributes are accessed via paths that start with an at sign (`@`).
Example:

```
@style.width
```

creates the following `AttributePathExpression`:

```js
new AttributePathExpression('style', ['width'])
```


#### BracketsExpression

Represents an expression that contains member access through brackets. The top-level `BracketsExpression` represents the
last set of brackets.

CTOR: TODO

Example:

```js
obj[style].en[v]
```

would be represented by:

```js
new BracketsExpression(
    new BracketsExpression(
        new PathExpression(['obj']),
        new PathExpression(['style']),
        ['en']),
    new expressions.PathExpression(['v']))
```



#### FnExpression

#### OperatorExpression

Inherits `FnExpression`.

#### NewExpression

Inherits `FnExpression`.

#### SequenceExpression

Inherits `OperatorExpression`.


#### ScopedModelExpression






## operatorFns

Exports two members: `get` and `set`.

get:
* !U -U +U ~U typeofU
* || && | ^ & == != === !== < > <= >= instanceof in << >> >>> + - * / % ? , [] {}

set:
* !U -U
* == === in + - * /







## templates

Template objects can directly create HTML for server rendering or DOM nodes for client rendering.

The `templates` member exposes the following properties.

* all `saddle` properties

#### View (inherits saddle.Template)

* `View(views, name, source, options)`: CTOR, called by `Views::register()`, for instance.
    * `views`: the `Views` object, there is only one per App.
    * `name`:
    * `source`:
    * `options`:
* `type`: constant string: `'View'`
* `get(context, unescaped)`: return the html of the view in the given `context`
* `getFragment(context, binding)`: return the view as a DocumentFragment in the given `context`. `binding`: TODO
* `appendTo`:
* `attachTo`:
* `dependencies`:
* `parse`: implemented only if `derby-parsing` is loaded




#### ViewInstance
#### DynamicViewInstance
#### ParentWrapper

#### Views

Manages all views for a Derby app.

* find
* `register(name, source, options)`: register a new view. See `View` CTOR for explanation of arguments.
* `serialize()`
* findErrorMessage


#### MarkupHook
#### ElementOn
#### ComponentOn
#### ComponentMarker
#### AsProperty
#### AsObject
#### AsObjectComponent
#### AsArray
#### AsArrayComponent

#### emptyTemplate

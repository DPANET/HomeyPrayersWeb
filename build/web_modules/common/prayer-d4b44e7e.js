import { c as createCommonjsModule, a as commonjsGlobal } from './_commonjsHelpers-95e6deb5.js';

var isNullOrUndefined_1 = createCommonjsModule(function (module, exports) {
Object.defineProperty(exports, "__esModule", { value: true });
function isNullOrUndefined(obj) {
    return typeof obj === "undefined" || obj === null;
}
exports.isNullOrUndefined = isNullOrUndefined;
});

/**
 * Creates a model schema that (de)serializes from / to plain javascript objects.
 * Its factory method is: `() => ({})`
 *
 * @example
 * var todoSchema = createSimpleSchema({
 *     title: true,
 *     done: true,
 * });
 *
 * var json = serialize(todoSchema, { title: 'Test', done: false });
 * var todo = deserialize(todoSchema, json);
 *
 * @param {object} props property mapping,
 * @returns {object} model schema
 */
function createSimpleSchema(props) {
    return {
        factory: function() {
            return {}
        },
        props: props
    }
}

var formatters = {
    j: function json(v) {
        try {
            return JSON.stringify(v)
        } catch (error) {
            return "[UnexpectedJSONParseError]: " + error.message
        }
    }
};

function invariant(condition, message) {
    if (!condition) {
        var variables = Array.prototype.slice.call(arguments, 2);
        var variablesToLog = [];

        var index = 0;
        var formattedMessage = message.replace(/%([a-zA-Z%])/g, function messageFormatter(match, format) {
            if (match === "%%") return match

            var formatter = formatters[format];

            if (typeof formatter === "function") {
                var variable = variables[index++];

                variablesToLog.push(variable);

                return formatter(variable)
            }

            return match
        });

        if (console && variablesToLog.length > 0) {
            // eslint-disable-next-line no-console
            console.log.apply(console, variablesToLog);
        }

        throw new Error("[serializr] " + (formattedMessage || "Illegal State"))
    }
}

function GUARDED_NOOP(err) {
    if (err) // unguarded error...
        throw new Error(err)
}

function once(fn) {
    var fired = false;
    return function () {
        if (!fired) {
            fired = true;
            return fn.apply(null, arguments)
        }
        invariant(false, "callback was invoked twice");
    }
}

function parallel(ar, processor, cb) {
    // TODO: limit parallelization?
    if (ar.length === 0)
        return void cb(null, [])
    var left = ar.filter(function(){ return true }).length; // only count items processed by forEach
    var resultArray = [];
    var failed = false;
    var processorCb = function (idx, err, result) {
        if (err) {
            if (!failed) {
                failed = true;
                cb(err);
            }
        } else {
            resultArray[idx] = result;
            if (--left === 0)
                cb(null, resultArray);
        }
    };
    ar.forEach(function (value, idx) {
        processor(value, processorCb.bind(null, idx), idx);
    });
}

function isPrimitive(value) {
    if (value === null)
        return true
    return typeof value !== "object" && typeof value !== "function"
}

function isModelSchema(thing) {
    return thing && thing.factory && thing.props
}

function isPropSchema(thing) {
    return thing && thing.serializer && thing.deserializer
}

function isAliasedPropSchema(propSchema) {
    return typeof propSchema === "object" && !!propSchema.jsonname
}

function isIdentifierPropSchema(propSchema) {
    return typeof propSchema === "object" && propSchema.identifier === true
}

function isAssignableTo(actualType, expectedType) {
    while (actualType) {
        if (actualType === expectedType)
            return true
        actualType = actualType.extends;
    }
    return false
}

function isMapLike(thing) {
    return thing && typeof thing.keys === "function" && typeof thing.clear === "function"
}

function getIdentifierProp(modelSchema) {
    invariant(isModelSchema(modelSchema));
    // optimization: cache this lookup
    while (modelSchema) {
        for (var propName in modelSchema.props)
            if (typeof modelSchema.props[propName] === "object" && modelSchema.props[propName].identifier === true)
                return propName
        modelSchema = modelSchema.extends;
    }
    return null
}

function processAdditionalPropArgs(propSchema, additionalArgs) {
    if (additionalArgs) {
        invariant(isPropSchema(propSchema), "expected a propSchema");
        var argNames = ["beforeDeserialize", "afterDeserialize"];
        argNames.forEach(function(argName) {
            if (typeof additionalArgs[argName] === "function") {
                propSchema[argName] = additionalArgs[argName];
            }
        });
    }
    return propSchema
}

/**
 * Returns the standard model schema associated with a class / constructor function
 *
 * @param {object} thing
 * @returns {ModelSchema} model schema
 */
function getDefaultModelSchema(thing) {
    if (!thing)
        return null
    if (isModelSchema(thing))
        return thing
    if (isModelSchema(thing.serializeInfo))
        return thing.serializeInfo
    if (thing.constructor && thing.constructor.serializeInfo)
        return thing.constructor.serializeInfo
}

/**
 * Sets the default model schema for class / constructor function.
 * Everywhere where a model schema is required as argument, this class / constructor function
 * can be passed in as well (for example when using `object` or `ref`.
 *
 * When passing an instance of this class to `serialize`, it is not required to pass the model schema
 * as first argument anymore, because the default schema will be inferred from the instance type.
 *
 * @param {constructor|class} clazz class or constructor function
 * @param {ModelSchema} modelSchema - a model schema
 * @returns {ModelSchema} model schema
 */
function setDefaultModelSchema(clazz, modelSchema) {
    invariant(isModelSchema(modelSchema));
    return clazz.serializeInfo = modelSchema
}

/**
 * Creates a model schema that (de)serializes an object created by a constructor function (class).
 * The created model schema is associated by the targeted type as default model schema, see setDefaultModelSchema.
 * Its factory method is `() => new clazz()` (unless overriden, see third arg).
 *
 * @example
 * function Todo(title, done) {
 *     this.title = title;
 *     this.done = done;
 * }
 *
 * createModelSchema(Todo, {
 *     title: true,
 *     done: true,
 * });
 *
 * var json = serialize(new Todo('Test', false));
 * var todo = deserialize(Todo, json);
 *
 * @param {constructor|class} clazz class or constructor function
 * @param {object} props property mapping
 * @param {function} factory optional custom factory. Receives context as first arg
 * @returns {object} model schema
 */
function createModelSchema(clazz, props, factory) {
    invariant(clazz !== Object, "one cannot simply put define a model schema for Object");
    invariant(typeof clazz === "function", "expected constructor function");
    var model = {
        targetClass: clazz,
        factory: factory || function() {
            return new clazz()
        },
        props: props
    };
    // find super model
    if (clazz.prototype.constructor !== Object) {
        var s = getDefaultModelSchema(clazz.prototype.constructor);
        if (s && s.targetClass !== clazz)
            model.extends = s;
    }
    setDefaultModelSchema(clazz, model);
    return model
}

/**
 * Indicates that this field contains a primitive value (or Date) which should be serialized literally to json.
 *
 * @example
 * createModelSchema(Todo, {
 *     title: primitive(),
 * });
 *
 * console.dir(serialize(new Todo('test')));
 * // outputs: { title : "test" }
 *
 * @param {AdditionalPropArgs} additionalArgs optional object that contains beforeDeserialize and/or afterDeserialize handlers
 * @returns {ModelSchema}
 */
function primitive(additionalArgs) {
    var result = {
        serializer: function (value) {
            invariant(isPrimitive(value), "this value is not primitive: " + value);
            return value
        },
        deserializer: function (jsonValue, done) {
            if (!isPrimitive(jsonValue))
                return void done("[serializr] this value is not primitive: " + jsonValue)
            return void done(null, jsonValue)
        }
    };
    result = processAdditionalPropArgs(result, additionalArgs);
    return result
}

/**
 * In the event that a property needs to be deserialized, but not serialized, you can use the SKIP symbol to omit the property. This has to be used with the custom serializer.
 *
 * @example
 * var schema = _.createSimpleSchema({
 *     a: _.custom(
 *         function(v) {
 *             return _.SKIP
 *         },
 *         function(v) {
 *             return v;
 *         }
 *     ),
 * });
 * t.deepEqual(_.serialize(s, { a: 4 }), { });
 * t.deepEqual(_.deserialize(s, { a: 4 }), { a: 4 });
 */
var SKIP = typeof Symbol !== "undefined" ? Symbol("SKIP") : { SKIP: true };

var _defaultPrimitiveProp = primitive();

// Ugly way to get the parameter names since they aren't easily retrievable via reflection
var STRIP_COMMENTS = /((\/\/.*$)|(\/\*[\s\S]*?\*\/))/mg;
var ARGUMENT_NAMES = /([^\s,]+)/g;

function getParamNames(func) {
    var fnStr = func.toString().replace(STRIP_COMMENTS, "");
    var result = fnStr.slice(fnStr.indexOf("(")+1, fnStr.indexOf(")")).match(ARGUMENT_NAMES);
    if(result === null)
        result = [];
    return result
}

function serializableDecorator(propSchema, target, propName, descriptor) {
    invariant(arguments.length >= 2, "too few arguments. Please use @serializable as property decorator");
    // Fix for @serializable used in class constructor params (typescript)
    var factory;
    if (propName === undefined && typeof target === "function"
        && target.prototype
        && descriptor !== undefined && typeof descriptor === "number") {
        invariant(isPropSchema(propSchema), "Constructor params must use alias(name)");
        invariant(propSchema.jsonname, "Constructor params must use alias(name)");
        var paramNames = getParamNames(target);
        if (paramNames.length >= descriptor) {
            propName = paramNames[descriptor];
            propSchema.paramNumber = descriptor;
            descriptor = undefined;
            target = target.prototype;
            // Create a factory so the constructor is called properly
            factory = function(context) {
                var params = [];
                for (var i = 0; i < target.constructor.length; i++) {
                    Object.keys(context.modelSchema.props).forEach(function (key) {
                        var prop = context.modelSchema.props[key];
                        if (prop.paramNumber === i) {
                            params[i] = context.json[prop.jsonname];
                        }
                    });
                }

                return new (Function.prototype.bind.apply(target.constructor, [null].concat(params)))
            };
        }
    }
    invariant(typeof propName === "string", "incorrect usage of @serializable decorator");
    var info = getDefaultModelSchema(target);

    if (!info || !target.constructor.hasOwnProperty("serializeInfo"))
        info = createModelSchema(target.constructor, {}, factory);
    if (info && info.targetClass !== target.constructor)
        // fixes typescript issue that tends to copy fields from super constructor to sub constructor in extends
        info = createModelSchema(target.constructor, {}, factory);
    info.props[propName] = propSchema;
    // MWE: why won't babel work without?
    if (descriptor && !descriptor.get && !descriptor.set)
        descriptor.writable = true;
    return descriptor
}

/**
 * Decorator that defines a new property mapping on the default model schema for the class
 * it is used in.
 *
 * When using typescript, the decorator can also be used on fields declared as constructor arguments (using the `private` / `protected` / `public` keywords).
 * The default factory will then invoke the constructor with the correct arguments as well.
 *
 * @example
 * class Todo {
 *     @serializable(primitive())
 *     title; // shorthand for primitves
 *
 *     @serializable done;
 *
 *     constructor(title, done) {
 *         this.title = title;
 *         this.done = done;
 *     }
 * }
 *
 * var json = serialize(new Todo('Test', false));
 * var todo = deserialize(Todo, json);
 *
 * @param arg1
 * @param arg2
 * @param arg3
 * @returns {PropertyDescriptor}
 */
function serializable(arg1, arg2, arg3) {
    if (arguments.length === 1) {
        // decorated with propSchema
        var propSchema = arg1 === true ? _defaultPrimitiveProp : arg1;
        invariant(isPropSchema(propSchema), "@serializable expects prop schema");
        return serializableDecorator.bind(null, propSchema)
    } else {
        // decorated without arguments, treat as primitive
        return serializableDecorator(primitive(), arg1, arg2, arg3)
    }
}

/**
 * Serializes an object (graph) into json using the provided model schema.
 * The model schema can be omitted if the object type has a default model schema associated with it.
 * If a list of objects is provided, they should have an uniform type.
 *
 * @param arg1 class or modelschema to use. Optional
 * @param arg2 object(s) to serialize
 * @returns {object} serialized representation of the object
 */
function serialize(arg1, arg2) {
    invariant(arguments.length === 1 || arguments.length === 2, "serialize expects one or 2 arguments");
    var thing = arguments.length === 1 ? arg1 : arg2;
    var schema = arguments.length === 1 ? null : arg1;
    if (Array.isArray(thing)) {
        if (thing.length === 0)
            return [] // don't bother finding a schema
        else if (!schema)
            schema = getDefaultModelSchema(thing[0]);
        else if (typeof schema !== "object")
            schema = getDefaultModelSchema(schema);
    } else if (!schema) {
        schema = getDefaultModelSchema(thing);
    } else if (typeof schema !== "object") {
        schema = getDefaultModelSchema(schema);
    }
    invariant(!!schema, "Failed to find default schema for " + arg1);
    if (Array.isArray(thing))
        return thing.map(function (item) {
            return serializeWithSchema(schema, item)
        })
    return serializeWithSchema(schema, thing)
}

function checkStarSchemaInvariant(propDef) {
    invariant(propDef === true || propDef.pattern, "prop schema '*' can only be used with 'true' or a prop def with a 'pattern': " + JSON.stringify(propDef));
}

function serializeWithSchema(schema, obj) {
    invariant(schema && typeof schema === "object" && schema.props, "Expected schema");
    invariant(obj && typeof obj === "object", "Expected object");
    var res;
    if (schema.extends)
        res = serializeWithSchema(schema.extends, obj);
    else {
        // TODO: make invariant?:  invariant(!obj.constructor.prototype.constructor.serializeInfo, "object has a serializable supertype, but modelschema did not provide extends clause")
        res = {};
    }
    Object.keys(schema.props).forEach(function (key) {
        var propDef = schema.props[key];
        if (key === "*") {
            serializeStarProps(schema, propDef, obj, res);
            return
        }
        if (propDef === true)
            propDef = _defaultPrimitiveProp;
        if (propDef === false)
            return
        var jsonValue = propDef.serializer(obj[key], key, obj);
        if (jsonValue === SKIP){
            return
        }
        res[propDef.jsonname || key] = jsonValue;
    });
    return res
}

function serializeStarProps(schema, propDef, obj, target) {
    checkStarSchemaInvariant(propDef);
    for (var key in obj) if (obj.hasOwnProperty(key)) if (!(key in schema.props)) {
        if ((propDef === true) || (propDef.pattern && propDef.pattern.test(key))) {
            var value = obj[key];
            if (propDef === true) {
                if (isPrimitive(value)) {
                    target[key] = value;
                }
            } else if (propDef.props) {
                var jsonValue = serialize(propDef, value);
                if (jsonValue === SKIP){
                    return
                }
                // todo: propDef.jsonname could be a transform function on key
                target[key] = jsonValue;
            } else {
                var jsonValue = propDef.serializer(value, key, obj);
                if (jsonValue === SKIP){
                    return
                }
                // todo: propDef.jsonname could be a transform function on key
                target[key] = jsonValue;
            }
        }
    }
}

var rootContextCache = new WeakMap();

function Context(parentContext, modelSchema, json, onReadyCb, customArgs) {
    this.parentContext = parentContext;
    this.isRoot = !parentContext;
    this.pendingCallbacks = 0;
    this.pendingRefsCount = 0;
    this.onReadyCb = onReadyCb || GUARDED_NOOP;
    this.json = json;
    this.target = null; // always set this property using setTarget
    this.hasError = false;
    this.modelSchema = modelSchema;
    if (this.isRoot) {
        this.rootContext = this;
        this.args = customArgs;
        this.pendingRefs = {}; // uuid: [{ modelSchema, uuid, cb }]
        this.resolvedRefs = {}; // uuid: [{ modelSchema, value }]
    } else {
        this.rootContext = parentContext.rootContext;
        this.args = parentContext.args;
    }
}

Context.prototype.createCallback = function (fn) {
    this.pendingCallbacks++;
    // once: defend against user-land calling 'done' twice
    return once(function (err, value) {
        if (err) {
            if (!this.hasError) {
                this.hasError = true;
                this.onReadyCb(err);
                rootContextCache.delete(this);
            }
        } else if (!this.hasError) {
            fn(value);
            if (--this.pendingCallbacks === this.pendingRefsCount) {
                if (this.pendingRefsCount > 0) {
                    // all pending callbacks are pending reference resolvers. not good.
                    this.onReadyCb(new Error(
                        "Unresolvable references in json: \"" +
                        Object.keys(this.pendingRefs).filter(function (uuid) {
                            return this.pendingRefs[uuid].length > 0
                        }, this).join("\", \"") +
                        "\""
                    ));
                    rootContextCache.delete(this);
                } else {
                    this.onReadyCb(null, this.target);
                    rootContextCache.delete(this);
                }
            }
        }
    }.bind(this))
};

// given an object with uuid, modelSchema, callback, awaits until the given uuid is available
// resolve immediately if possible
Context.prototype.await = function (modelSchema, uuid, callback) {
    invariant(this.isRoot);
    if (uuid in this.resolvedRefs) {
        var match = this.resolvedRefs[uuid].filter(function (resolved) {
            return isAssignableTo(resolved.modelSchema, modelSchema)
        })[0];
        if (match)
            return void callback(null, match.value)
    }
    this.pendingRefsCount++;
    if (!this.pendingRefs[uuid])
        this.pendingRefs[uuid] = [];
    this.pendingRefs[uuid].push({
        modelSchema: modelSchema,
        uuid: uuid,
        callback: callback
    });
};

// given a model schema, uuid and value, resolve all references that where looking for this object
Context.prototype.resolve = function (modelSchema, uuid, value) {
    invariant(this.isRoot);
    if (!this.resolvedRefs[uuid])
        this.resolvedRefs[uuid] = [];
    this.resolvedRefs[uuid].push({
        modelSchema: modelSchema, value: value
    });
    if (uuid in this.pendingRefs) {
        for (var i = this.pendingRefs[uuid].length - 1; i >= 0; i--) {
            var opts = this.pendingRefs[uuid][i];
            if (isAssignableTo(modelSchema, opts.modelSchema)) {
                this.pendingRefs[uuid].splice(i, 1);
                this.pendingRefsCount--;
                opts.callback(null, value);
            }
        }
    }
};

// set target and update root context cache
Context.prototype.setTarget = function (target) {
    if (this.isRoot && this.target) {
        rootContextCache.delete(this.target);
    }
    this.target = target;
    rootContextCache.set(this.target, this);
};

// call all remaining reference lookup callbacks indicating an error during ref resolution
Context.prototype.cancelAwaits = function () {
    invariant(this.isRoot);
    var self = this;
    Object.keys(this.pendingRefs).forEach(function (uuid) {
        self.pendingRefs[uuid].forEach(function (refOpts) {
            self.pendingRefsCount--;
            refOpts.callback(new Error("Reference resolution canceled for " + uuid));
        });
    });
    this.pendingRefs = {};
    this.pendingRefsCount = 0;
};

function getTargetContext(target) {
    return rootContextCache.get(target)
}

/*
 * Deserialization
 */

function schemaHasAlias(schema, name) {
    for (var key in schema.props)
        if (typeof schema.props[key] === "object" && schema.props[key].jsonname === name)
            return true
    return false
}

function deserializeStarProps(context, schema, propDef, obj, json) {
    checkStarSchemaInvariant(propDef);
    for (var key in json) if (!(key in schema.props) && !schemaHasAlias(schema, key)) {
        var jsonValue = json[key];
        if (propDef === true) {
            // when deserializing we don't want to silently ignore 'unparseable data' to avoid
            // confusing bugs
            invariant(isPrimitive(jsonValue),
                "encountered non primitive value while deserializing '*' properties in property '" +
                key + "': " + jsonValue);
            obj[key] = jsonValue;
        } else if (propDef.pattern.test(key)) {
            if (propDef.factory) {
                var resultValue = deserializeObjectWithSchema(context, propDef, jsonValue, context.callback || GUARDED_NOOP, {});
                // deserializeObjectWithSchema returns undefined on error
                if (resultValue !== undefined) {
                    obj[key] = resultValue;
                }
            } else {
                function setValue(resultValue) {
                    if (resultValue !== SKIP) {
                        obj[key] = resultValue;
                    }
                }
                propDef.deserializer(jsonValue,
                    // for individual props, use root context based callbacks
                    // this allows props to complete after completing the object itself
                    // enabling reference resolving and such
                    context.rootContext.createCallback(setValue),
                    context);
            }
        }
    }
}

/**
 * Deserializes a json structure into an object graph.
 *
 * This process might be asynchronous (for example if there are references with an asynchronous
 * lookup function). The function returns an object (or array of objects), but the returned object
 * might be incomplete until the callback has fired as well (which might happen immediately)
 *
 * @param {object|array} schema to use for deserialization
 * @param {json} json data to deserialize
 * @param {function} callback node style callback that is invoked once the deserialization has
 *   finished. First argument is the optional error, second argument is the deserialized object
 *   (same as the return value)
 * @param {*} customArgs custom arguments that are available as `context.args` during the
 *   deserialization process. This can be used as dependency injection mechanism to pass in, for
 *   example, stores.
 * @returns {object|array} deserialized object, possibly incomplete.
 */
function deserialize(schema, json, callback, customArgs) {
    invariant(arguments.length >= 2, "deserialize expects at least 2 arguments");
    schema = getDefaultModelSchema(schema);
    invariant(isModelSchema(schema), "first argument should be model schema");
    if (Array.isArray(json)) {
        var items = [];
        parallel(
            json,
            function (childJson, itemDone) {
                var instance = deserializeObjectWithSchema(null, schema, childJson, itemDone, customArgs);
                // instance is created synchronously so can be pushed
                items.push(instance);
            },
            callback || GUARDED_NOOP
        );
        return items
    } else
        return deserializeObjectWithSchema(null, schema, json, callback, customArgs)
}

function deserializeObjectWithSchema(parentContext, modelSchema, json, callback, customArgs) {
    if (json === null || json === undefined || typeof json !== "object")
        return void callback(null, null)
    var context = new Context(parentContext, modelSchema, json, callback, customArgs);
    var target = modelSchema.factory(context);
    // todo async invariant
    invariant(!!target, "No object returned from factory");
    // TODO: make invariant?            invariant(schema.extends ||
    // !target.constructor.prototype.constructor.serializeInfo, "object has a serializable
    // supertype, but modelschema did not provide extends clause")
    context.setTarget(target);
    var lock = context.createCallback(GUARDED_NOOP);
    deserializePropsWithSchema(context, modelSchema, json, target);
    lock();
    return target
}

function deserializePropsWithSchema(context, modelSchema, json, target) {
    if (modelSchema.extends)
        deserializePropsWithSchema(context, modelSchema.extends, json, target);

    function deserializeProp(propDef, jsonValue, propName) {

        function setValue(value) {
            if (value !== SKIP) {
                target[propName] = value;
            }
        }

        function preProcess(resultCallback) {
            return function (err, newValue) {
                function finalCallback(errPreliminary, finalOrRetryValue) {
                    if (errPreliminary && finalOrRetryValue !== undefined &&
                        typeof propDef.afterDeserialize === "function") {

                        propDef.deserializer(
                            finalOrRetryValue,
                            preProcess(resultCallback),
                            context,
                            target[propName]
                        );
                    } else {
                        resultCallback(errPreliminary, finalOrRetryValue);
                    }
                }

                onAfterDeserialize(finalCallback, err, newValue, jsonValue, json,
                    propName, context, propDef);
            }
        }

        propDef.deserializer(
            jsonValue,
            // for individual props, use root context based callbacks
            // this allows props to complete after completing the object itself
            // enabling reference resolving and such
            preProcess(context.rootContext.createCallback(setValue)),
            context,
            target[propName] // initial value
        );
    }

    Object.keys(modelSchema.props).forEach(function (propName) {
        var propDef = modelSchema.props[propName];

        function callbackDeserialize(err, jsonValue) {
            if (!err && jsonValue !== undefined) {
                deserializeProp(propDef, jsonValue, propName);
            }
        }
        if (propName === "*") {
            deserializeStarProps(context, modelSchema, propDef, target, json);
            return
        }
        if (propDef === true)
            propDef = _defaultPrimitiveProp;
        if (propDef === false)
            return
        var jsonAttr = propDef.jsonname || propName;
        var jsonValue = json[jsonAttr];
        onBeforeDeserialize(callbackDeserialize, jsonValue, json, jsonAttr, context, propDef);
    });
}


function onBeforeDeserialize(
    callback, jsonValue, jsonParentValue, propNameOrIndex, context, propDef) {

    if (propDef && typeof propDef.beforeDeserialize === "function") {
        propDef.beforeDeserialize(callback, jsonValue, jsonParentValue, propNameOrIndex, context,
            propDef);
    } else {
        callback(null, jsonValue);
    }
}

function onAfterDeserialize(
    callback, err, newValue, jsonValue, jsonParentValue, propNameOrIndex, context, propDef) {

    if (propDef && typeof propDef.afterDeserialize === "function") {
        propDef.afterDeserialize(callback, err, newValue, jsonValue, jsonParentValue,
            propNameOrIndex, context, propDef);
    } else {
        callback(err, newValue);
    }
}

/**
 * `object` indicates that this property contains an object that needs to be (de)serialized
 * using its own model schema.
 *
 * N.B. mind issues with circular dependencies when importing model schema's from other files! The module resolve algorithm might expose classes before `createModelSchema` is executed for the target class.
 *
 * @example
 * class SubTask {}
 * class Todo {}
 *
 * createModelSchema(SubTask, {
 *     title: true,
 * });
 * createModelSchema(Todo, {
 *     title: true,
 *     subTask: object(SubTask),
 * });
 *
 * const todo = deserialize(Todo, {
 *     title: 'Task',
 *     subTask: {
 *         title: 'Sub task',
 *     },
 * });
 *
 * @param {ModelSchema} modelSchema to be used to (de)serialize the object
 * @param {AdditionalPropArgs} additionalArgs optional object that contains beforeDeserialize and/or afterDeserialize handlers
 * @returns {PropSchema}
 */
function object(modelSchema, additionalArgs) {
    invariant(typeof modelSchema === "object" || typeof modelSchema === "function", "No modelschema provided. If you are importing it from another file be aware of circular dependencies.");
    var result = {
        serializer: function (item) {
            modelSchema = getDefaultModelSchema(modelSchema);
            invariant(isModelSchema(modelSchema), "expected modelSchema, got " + modelSchema);
            if (item === null || item === undefined)
                return item
            return serialize(modelSchema, item)
        },
        deserializer: function (childJson, done, context) {
            modelSchema = getDefaultModelSchema(modelSchema);
            invariant(isModelSchema(modelSchema), "expected modelSchema, got " + modelSchema);
            if (childJson === null || childJson === undefined)
                return void done(null, childJson)
            return void deserializeObjectWithSchema(context, modelSchema, childJson, done, additionalArgs)
        }
    };
    result = processAdditionalPropArgs(result, additionalArgs);
    return result
}

/**
 * The `serializeAll` decorator can may used on a class to signal that all primitive properties,
 * or complex properties with a name matching a `pattern`, should be serialized automatically.
 *
 * @example
 * @serializeAll class Store {
 *     a = 3;
 *     b;
 * }
 *
 * const store = new Store();
 * store.c = 5;
 * store.d = {};
 * t.deepEqual(serialize(store), { c: 5 });
 *
 * @example
 * class DataType {
 *     @serializable
 *     x;
 *     @serializable
 *     y;
 * }
 * @serializeAll(/^[a-z]$/, DataType) class ComplexStore {
 * }
 *
 * const store = new ComplexStore();
 * store.a = {x: 1, y: 2};
 * store.b = {};
 * store.somethingElse = 5;
 * t.deepEqual(serialize(store), { a: {x: 1, y: 2}, b: { x: undefined, y: undefined } });
 */
function serializeAll(targetOrPattern, clazzOrSchema) {
    let propSchema;
    let invokeImmediately = false;
    if (arguments.length === 1) {
        invariant(typeof targetOrPattern === "function", "@serializeAll can only be used as class decorator");
        propSchema = true;
        invokeImmediately = true;
    }
    else {
        invariant(typeof targetOrPattern === "object" && targetOrPattern.test, "@serializeAll pattern doesn't have test");
        if (typeof clazzOrSchema === "function") {
            clazzOrSchema = object(clazzOrSchema);
        }
        invariant(typeof clazzOrSchema === "object" && clazzOrSchema.serializer, "couldn't resolve schema");
        propSchema = Object.assign({}, clazzOrSchema, {pattern: targetOrPattern});
    }
    function result(target) {
        var info = getDefaultModelSchema(target);
        if (!info || !target.hasOwnProperty("serializeInfo")) {
            info = createModelSchema(target, {});
            setDefaultModelSchema(target, info);
        }
        getDefaultModelSchema(target).props["*"] = propSchema;
        return target;
    }
    if (invokeImmediately) {
        return result(targetOrPattern);
    }
    return result;
}

/*
 * Deserialization
 */


/**
 * Cancels an asynchronous deserialization or update operation for the specified target object.
 * @param instance object that was previously returned from deserialize or update method
 */
function cancelDeserialize(instance) {
    invariant(typeof instance === "object" && instance && !Array.isArray(instance), "cancelDeserialize needs an object");
    var context = getTargetContext(instance);
    if (context) {
        context.cancelAwaits();
    }
}

/*
 * Update
 */

/**
 * Similar to deserialize, but updates an existing object instance.
 * Properties will always updated entirely, but properties not present in the json will be kept as is.
 * Further this method behaves similar to deserialize.
 *
 * @param {object} modelSchema, optional if it can be inferred from the instance type
 * @param {object} target target instance to update
 * @param {object} json the json to deserialize
 * @param {function} callback the callback to invoke once deserialization has completed.
 * @param {*} customArgs custom arguments that are available as `context.args` during the deserialization process. This can be used as dependency injection mechanism to pass in, for example, stores.
 * @returns {object|array} deserialized object, possibly incomplete.
 */
function update(modelSchema, target, json, callback, customArgs) {
    var inferModelSchema =
        arguments.length === 2 // only target and json
        || typeof arguments[2] === "function"; // callback as third arg

    if (inferModelSchema) {
        target = arguments[0];
        modelSchema = getDefaultModelSchema(target);
        json = arguments[1];
        callback = arguments[2];
        customArgs = arguments[3];
    } else {
        modelSchema = getDefaultModelSchema(modelSchema);
    }
    invariant(isModelSchema(modelSchema), "update failed to determine schema");
    invariant(typeof target === "object" && target && !Array.isArray(target), "update needs an object");
    var context = new Context(null, modelSchema, json, callback, customArgs);
    context.setTarget(target);
    var lock = context.createCallback(GUARDED_NOOP);
    var result = deserializePropsWithSchema(context, modelSchema, json, target);
    lock();
    return result
}

function defaultRegisterFunction(id, value, context) {
    context.rootContext.resolve(context.modelSchema, id, context.target);
}

/**
 *
 *
 * Similar to primitive, but this field will be marked as the identifier for the given Model type.
 * This is used by for example `reference()` to serialize the reference
 *
 * Identifier accepts an optional `registerFn` with the signature:
 * `(id, target, context) => void`
 * that can be used to register this object in some store. note that not all fields of this object might
 * have been deserialized yet.
 *
 * @example
 * var todos = {};
 *
 * var s = _.createSimpleSchema({
 *     id: _.identifier((id, object) => (todos[id] = object)),
 *     title: true,
 * });
 *
 * _.deserialize(s, {
 *     id: 1,
 *     title: 'test0',
 * });
 * _.deserialize(s, [{ id: 2, title: 'test2' }, { id: 1, title: 'test1' }]);
 *
 * t.deepEqual(todos, {
 *     1: { id: 1, title: 'test1' },
 *     2: { id: 2, title: 'test2' },
 * });
 *
 * @param { RegisterFunction | AdditionalPropArgs } arg1 optional registerFn: function to register this object during creation.
 * @param {AdditionalPropArgs} arg2 optional object that contains beforeDeserialize and/or afterDeserialize handlers
 *
 * @returns {PropSchema}
 */
function identifier(arg1, arg2) {
    var registerFn, additionalArgs;
    if (typeof arg1 === "function") {
        registerFn = arg1;
        additionalArgs = arg2;
    } else {
        additionalArgs = arg1;
    }
    invariant(!additionalArgs || typeof additionalArgs === "object", "Additional property arguments should be an object, register function should be omitted or a funtion");
    var result = {
        identifier: true,
        serializer: _defaultPrimitiveProp.serializer,
        deserializer: function (jsonValue, done, context) {
            _defaultPrimitiveProp.deserializer(jsonValue, function(err, id) {
                defaultRegisterFunction(id, context.target, context);
                if (registerFn)
                    registerFn(id, context.target, context);
                done(err, id);
            });
        }
    };
    result = processAdditionalPropArgs(result, additionalArgs);
    return result
}

/**
 * Similar to primitive, serializes instances of Date objects
 *
 * @param {AdditionalPropArgs} additionalArgs optional object that contains beforeDeserialize and/or afterDeserialize handlers
 * @returns {PropSchema}
 */
function date(additionalArgs) {
    // TODO: add format option?
    var result = {
        serializer: function(value) {
            if (value === null || value === undefined)
                return value
            invariant(value instanceof Date, "Expected Date object");
            return value.getTime()
        },
        deserializer: function (jsonValue, done) {
            if (jsonValue === null || jsonValue === undefined)
                return void done(null, jsonValue)
            return void done(null, new Date(jsonValue))
        }
    };
    result = processAdditionalPropArgs(result, additionalArgs);
    return result
}

/**
 * Alias indicates that this model property should be named differently in the generated json.
 * Alias should be the outermost propschema.
 *
 * @example
 * createModelSchema(Todo, {
 *     title: alias('task', primitive()),
 * });
 *
 * console.dir(serialize(new Todo('test')));
 * // { task : "test" }
 *
 * @param {string} name name of the json field to be used for this property
 * @param {PropSchema} propSchema propSchema to (de)serialize the contents of this field
 * @returns {PropSchema}
 */
function alias(name, propSchema) {
    invariant(name && typeof name === "string", "expected prop name as first argument");
    propSchema = (!propSchema || propSchema === true)  ? _defaultPrimitiveProp : propSchema;
    invariant(isPropSchema(propSchema), "expected prop schema as second argument");
    invariant(!isAliasedPropSchema(propSchema), "provided prop is already aliased");
    return {
        jsonname: name,
        serializer: propSchema.serializer,
        deserializer: propSchema.deserializer,
        identifier: isIdentifierPropSchema(propSchema),
        beforeDeserialize: propSchema.beforeDeserialize,
        afterDeserialize: propSchema.afterDeserialize
    }
}

/**
 * Can be used to create simple custom propSchema. Multiple things can be done inside of a custom propSchema, like deserializing and serializing other (polymorphic) objects, skipping the serialization of something or checking the context of the obj being (de)serialized.

 * The `custom` function takes two parameters, the `serializer` function and the `deserializer` function.

 * The `serializer` function has the signature:
 * `(value, key, obj) => void`

 * When serializing the object `{a: 1}` the `serializer` function will be called with `serializer(1, 'a', {a: 1})`.

 * The `deserializer` function has the following signature for synchronous processing
 * `(value, context, oldValue) => void`

 * For asynchronous processing the function expects the following signature
 * `(value, context, oldValue, callback) => void`

 * When deserializing the object `{b: 2}` the `deserializer` function will be called with `deserializer(2, contextObj)` ([contextObj reference](https://github.com/mobxjs/serializr#deserialization-context)).
 *
 * @example
 * var schemaDefault = _.createSimpleSchema({
 *     a: _.custom(
 *         function(v) {
 *             return v + 2;
 *         },
 *         function(v) {
 *             return v - 2;
 *         }
 *     ),
 * });
 * t.deepEqual(_.serialize(schemaDefault, { a: 4 }), { a: 6 });
 * t.deepEqual(_.deserialize(schemaDefault, { a: 6 }), { a: 4 });
 *
 * var schemaWithAsyncProps = _.createSimpleSchema({
 *     a: _.customAsync(
 *         function(v) {
 *             return v + 2;
 *         },
 *         function(v, context, oldValue, callback) {
 *             somePromise(v, context, oldValue).then((result) => {
 *                 callback(null, result - 2)
 *             }.catch((err) => {
 *                 callback(err)
 *             }
 *         }
 *     ),
 * });
 * t.deepEqual(_.serialize(schemaWithAsyncProps, { a: 4 }), { a: 6 });
 * _.deserialize(schemaWithAsyncProps, { a: 6 }, (err, res) => {
 *   t.deepEqual(res.a, 4)
 * };

 *
 * @param {function} serializer function that takes a model value and turns it into a json value
 * @param {function} deserializer function that takes a json value and turns it into a model value. It also takes context argument, which can allow you to deserialize based on the context of other parameters.
 * @param {AdditionalPropArgs} additionalArgs optional object that contains beforeDeserialize and/or afterDeserialize handlers
 * @returns {PropSchema}
 */
function custom(serializer, deserializer, additionalArgs) {
    invariant(typeof serializer === "function", "first argument should be function");
    invariant((typeof deserializer === "function"), "second argument should be a function or promise");
    var result = {
        serializer: serializer,
        deserializer: function (jsonValue, done, context, oldValue) {
            if (deserializer.length === 4) {
                deserializer(jsonValue, context, oldValue, done, additionalArgs);
            } else {
                done(null, deserializer(jsonValue, context, oldValue, null, additionalArgs));
            }
        }
    };
    result = processAdditionalPropArgs(result, additionalArgs);
    return result
}

/**
 * Optional indicates that this model property shouldn't be serialized if it isn't present.
 *
 * @example
 * createModelSchema(Todo, {
 *     title: optional(primitive()),
 * });
 *
 * console.dir(serialize(new Todo()));
 * // {}
 *
 * @param {PropSchema} propSchema propSchema to (de)serialize the contents of this field
 * @returns {PropSchema}
 */
function optional(name, propSchema) {
    propSchema = (!propSchema || propSchema === true)  ? _defaultPrimitiveProp : propSchema;
    invariant(isPropSchema(propSchema), "expected prop schema as second argument");
    const propSerializer = propSchema.serializer;
    invariant(typeof propSerializer === "function", "expected prop schema to have a callable serializer");
    function serializer(...args) {
        const result = propSerializer(...args);
        if (result === undefined) {
            return SKIP
        }
        return result
    }
    return Object.assign({}, propSchema, {serializer})
}

function createDefaultRefLookup(modelSchema) {
    return function resolve(uuid, cb, context) {
        context.rootContext.await(modelSchema, uuid, cb);
    }
}

/**
 * `reference` can be used to (de)serialize references that point to other models.
 *
 * The first parameter should be either a ModelSchema that has an `identifier()` property (see identifier)
 * or a string that represents which attribute in the target object represents the identifier of the object.
 *
 * The second parameter is a lookup function that is invoked during deserialization to resolve an identifier to
 * an object. Its signature should be as follows:
 *
 * `lookupFunction(identifier, callback, context)` where:
 * 1. `identifier` is the identifier being resolved
 * 2. `callback` is a node style calblack function to be invoked with the found object (as second arg) or an error (first arg)
 * 3. `context` see context.
 *
 * The lookupFunction is optional. If it is not provided, it will try to find an object of the expected type and required identifier within the same JSON document
 *
 * N.B. mind issues with circular dependencies when importing model schemas from other files! The module resolve algorithm might expose classes before `createModelSchema` is executed for the target class.
 *
 * @example
 * class User {}
 * class Post {}
 *
 * createModelSchema(User, {
 *     uuid: identifier(),
 *     displayname: primitive(),
 * });
 *
 * createModelSchema(Post, {
 *     author: reference(User, findUserById),
 *     message: primitive(),
 * });
 *
 * function findUserById(uuid, callback) {
 *     fetch('http://host/user/' + uuid)
 *         .then(userData => {
 *             deserialize(User, userData, callback);
 *         })
 *         .catch(callback);
 * }
 *
 * deserialize(
 *     Post,
 *     {
 *         message: 'Hello World',
 *         author: 234,
 *     },
 *     (err, post) => {
 *         console.log(post);
 *     }
 * );
 *
 * @param target: ModelSchema or string
 * @param {RefLookupFunction | AdditionalPropArgs} lookupFn optional function or additionalArgs object
 * @param {AdditionalPropArgs} additionalArgs optional object that contains beforeDeserialize and/or afterDeserialize handlers
 * @returns {PropSchema}
 */
function reference(target, lookupFn, additionalArgs) {
    invariant(!!target, "No modelschema provided. If you are importing it from another file be aware of circular dependencies.");
    var initialized = false;
    var childIdentifierAttribute;
    if (typeof lookupFn === "object" && additionalArgs === undefined) {
        additionalArgs = lookupFn;
        lookupFn = undefined;
    }
    function initialize() {
        initialized = true;
        invariant(typeof target !== "string" || lookupFn && typeof lookupFn === "function", "if the reference target is specified by attribute name, a lookup function is required");
        invariant(!lookupFn || typeof lookupFn === "function", "second argument should be a lookup function or additional arguments object");
        if (typeof target === "string")
            childIdentifierAttribute = target;
        else {
            var modelSchema = getDefaultModelSchema(target);
            invariant(isModelSchema(modelSchema), "expected model schema or string as first argument for 'ref', got " + modelSchema);
            lookupFn = lookupFn || createDefaultRefLookup(modelSchema);
            childIdentifierAttribute = getIdentifierProp(modelSchema);
            invariant(!!childIdentifierAttribute, "provided model schema doesn't define an identifier() property and cannot be used by 'ref'.");
        }
    }
    var result = {
        serializer: function (item) {
            if (!initialized)
                initialize();
            return item ? item[childIdentifierAttribute] : null
        },
        deserializer: function(identifierValue, done, context) {
            if (!initialized)
                initialize();
            if (identifierValue === null || identifierValue === undefined)
                done(null, identifierValue);
            else
                lookupFn(identifierValue, done, context);
        }
    };
    result = processAdditionalPropArgs(result, additionalArgs);
    return result
}

/**
 * List indicates that this property contains a list of things.
 * Accepts a sub model schema to serialize the contents
 *
 * @example
 * class SubTask {}
 * class Task {}
 * class Todo {}
 *
 * createModelSchema(SubTask, {
 *     title: true,
 * });
 * createModelSchema(Todo, {
 *     title: true,
 *     subTask: list(object(SubTask)),
 * });
 *
 * const todo = deserialize(Todo, {
 *     title: 'Task',
 *     subTask: [
 *         {
 *             title: 'Sub task 1',
 *         },
 *     ],
 * });
 *
 * @param {PropSchema} propSchema to be used to (de)serialize the contents of the array
 * @param {AdditionalPropArgs} additionalArgs optional object that contains beforeDeserialize and/or afterDeserialize handlers
 * @returns {PropSchema}
 */
function list(propSchema, additionalArgs) {
    propSchema = propSchema || _defaultPrimitiveProp;
    invariant(isPropSchema(propSchema), "expected prop schema as first argument");
    invariant(!isAliasedPropSchema(propSchema),
        "provided prop is aliased, please put aliases first");
    var result = {
        serializer: function (ar) {
            if (ar === undefined) {
                return SKIP
            }
            invariant(ar && "length" in ar && "map" in ar, "expected array (like) object");
            return ar.map(propSchema.serializer)
        },
        deserializer: function (jsonArray, done, context) {
            if (!Array.isArray(jsonArray))
                return void done("[serializr] expected JSON array")

            function processItem(jsonValue, onItemDone, itemIndex) {
                function callbackBefore(err, value) {
                    if (!err) {
                        propSchema.deserializer(value, deserializeDone, context);
                    } else {
                        onItemDone(err);
                    }
                }

                function deserializeDone(err, value) {
                    if (typeof propSchema.afterDeserialize === "function") {
                        onAfterDeserialize(callbackAfter, err, value, jsonValue, itemIndex, context,
                            propSchema);
                    } else {
                        onItemDone(err, value);
                    }
                }

                function callbackAfter(errPreliminary, finalOrRetryValue) {
                    if (errPreliminary && finalOrRetryValue !== undefined &&
                        typeof propSchema.afterDeserialize === "function") {

                        propSchema.deserializer(
                            finalOrRetryValue,
                            deserializeDone,
                            context
                        );
                    } else {
                        onItemDone(errPreliminary, finalOrRetryValue);
                    }
                }

                onBeforeDeserialize(callbackBefore, jsonValue, jsonArray, itemIndex, context,
                    propSchema);
            }

            parallel(
                jsonArray,
                processItem,
                done
            );
        }
    };
    result = processAdditionalPropArgs(result, additionalArgs);
    return result
}

/**
 * Similar to list, but map represents a string keyed dynamic collection.
 * This can be both plain objects (default) or ES6 Map like structures.
 * This will be inferred from the initial value of the targetted attribute.
 *
 * @param {*} propSchema
 * @param {AdditionalPropArgs} additionalArgs optional object that contains beforeDeserialize and/or afterDeserialize handlers
 * @returns {PropSchema}
 */
function map(propSchema, additionalArgs) {
    propSchema = propSchema || _defaultPrimitiveProp;
    invariant(isPropSchema(propSchema), "expected prop schema as first argument");
    invariant(!isAliasedPropSchema(propSchema), "provided prop is aliased, please put aliases first");
    var res = {
        serializer: function (m) {
            invariant(m && typeof m === "object", "expected object or Map");
            var isMap = isMapLike(m);
            var result = {};
            if (isMap)
                m.forEach(function (value, key) {
                    result[key] = propSchema.serializer(value);
                });
            else for (var key in m)
                result[key] = propSchema.serializer(m[key]);
            return result
        },
        deserializer: function (jsonObject, done, context, oldValue) {
            if (!jsonObject || typeof jsonObject !== "object")
                return void done("[serializr] expected JSON object")
            var keys = Object.keys(jsonObject);
            list(propSchema, additionalArgs).deserializer(
                keys.map(function (key) {
                    return jsonObject[key]
                }),
                function (err, values) {
                    if (err)
                        return void done(err)
                    var isMap = isMapLike(oldValue);
                    var newValue;
                    if (isMap) {
                        // if the oldValue is a map, we recycle it
                        // there are many variations and this way we don't have to
                        // know about the original constructor
                        oldValue.clear();
                        newValue = oldValue;
                    } else
                        newValue = {};
                    for (var i = 0, l = keys.length; i < l; i++)
                        if (isMap)
                            newValue.set(keys[i], values[i]);
                        else
                            newValue[keys[i]] = values[i];
                    done(null, newValue);
                },
                context
            );
        }
    };
    res = processAdditionalPropArgs(res, additionalArgs);
    return res
}

/**
 * Similar to map, mapAsArray can be used to serialize a map-like collection where the key is
 * contained in the 'value object'. Example: consider Map<id: number, customer: Customer> where the
 * Customer object has the id stored on itself. mapAsArray stores all values from the map into an
 * array which is serialized. Deserialization returns a ES6 Map or plain object object where the
 * `keyPropertyName` of each object is used for keys. For ES6 maps this has the benefit of being
 * allowed to have non-string keys in the map. The serialized json also may be slightly more
 * compact.
 *
 * @param {any} propSchema
 * @param {string} keyPropertyName - the property of stored objects used as key in the map
 * @param {AdditionalPropArgs} additionalArgs optional object that contains beforeDeserialize and/or afterDeserialize handlers
 * @returns {PropSchema}
 */
function mapAsArray(propSchema, keyPropertyName, additionalArgs) {
    propSchema = propSchema || _defaultPrimitiveProp;
    invariant(isPropSchema(propSchema), "expected prop schema as first argument");
    invariant(!!keyPropertyName, "expected key property name as second argument");
    var res = {
        serializer: function (m) {
            invariant(m && typeof m === "object", "expected object or Map");
            var isMap = isMapLike(m);
            var result = [];
            // eslint-disable-next-line no-unused-vars
            if (isMap) {
                m.forEach(function (value) {
                    result.push(propSchema.serializer(value));
                });
            } else for (var key in m) {
                result.push(propSchema.serializer(m[key]));
                // result[key] = propSchema.serializer(m[key])
            }
            return result
        },
        deserializer: function (jsonArray, done, context, oldValue) {
            list(propSchema, additionalArgs).deserializer(
                jsonArray,
                function (err, values) {
                    if (err)
                        return void done(err)
                    var isMap = isMapLike(oldValue);
                    var newValue;
                    if (isMap) {
                        oldValue.clear();
                        newValue = oldValue;
                    } else {
                        newValue = {};
                    }
                    for (var i = 0, l = jsonArray.length; i < l; i++)
                        if (isMap)
                            newValue.set(values[i][keyPropertyName], values[i]);
                        else
                            newValue[values[i][keyPropertyName].toString()] = values[i];
                    done(null, newValue);
                },
                context
            );
        }
    };
    res = processAdditionalPropArgs(res, additionalArgs);
    return res
}

/**
 * Indicates that this field is only need to putted in the serialized json or
 * deserialized instance, without any transformations. Stay with its original value
 *
 * @example
 * createModelSchema(Model, {
 *     rawData: raw(),
 * });
 *
 * console.dir(serialize(new Model({ rawData: { a: 1, b: [], c: {} } } })));
 * // outputs: { rawData: { a: 1, b: [], c: {} } } }
 *
 * @param {AdditionalPropArgs} additionalArgs optional object that contains beforeDeserialize and/or afterDeserialize handlers
 * @returns {ModelSchema}
 */
function raw(additionalArgs) {
    var result = {
        serializer: function (value) {
            return value
        },
        deserializer: function (jsonValue, done) {
            return void done(null, jsonValue)
        }
    };
    result = processAdditionalPropArgs(result, additionalArgs);
    return result
}

var serializr = /*#__PURE__*/Object.freeze({
    __proto__: null,
    createSimpleSchema: createSimpleSchema,
    createModelSchema: createModelSchema,
    getDefaultModelSchema: getDefaultModelSchema,
    setDefaultModelSchema: setDefaultModelSchema,
    serializable: serializable,
    serialize: serialize,
    serializeAll: serializeAll,
    cancelDeserialize: cancelDeserialize,
    deserialize: deserialize,
    update: update,
    primitive: primitive,
    identifier: identifier,
    date: date,
    alias: alias,
    custom: custom,
    object: object,
    child: object,
    optional: optional,
    reference: reference,
    ref: reference,
    list: list,
    map: map,
    mapAsArray: mapAsArray,
    raw: raw,
    SKIP: SKIP
});

var location_1 = createCommonjsModule(function (module, exports) {
var __decorate = (commonjsGlobal && commonjsGlobal.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });


var LocationTypeName;
(function (LocationTypeName) {
    LocationTypeName["LocationBuilder"] = "Location Builder";
})(LocationTypeName = exports.LocationTypeName || (exports.LocationTypeName = {}));
class Location {
    constructor(location, timeZone) {
        if (!isNullOrUndefined_1.isNullOrUndefined(location)) {
            this._latitude = location.latitude;
            this._longtitude = location.longtitude;
            this._countryCode = location.countryCode;
            this._countryName = location.countryName;
            this._address = location.address;
        }
        if (!isNullOrUndefined_1.isNullOrUndefined(timeZone)) {
            this._timeZoneId = timeZone.timeZoneId;
            this._timeZoneName = timeZone.timeZoneName;
            this._dstOffset = timeZone.dstOffset;
            this._rawOffset = timeZone.rawOffset;
        }
    }
    get latitude() {
        return this._latitude;
    }
    set latitude(value) {
        this._latitude = value;
    }
    get longtitude() {
        return this._longtitude;
    }
    set longtitude(value) {
        this._longtitude = value;
    }
    get city() {
        return this._city;
    }
    set city(value) {
        this._city = value;
    }
    get countryCode() {
        return this._countryCode;
    }
    set countryCode(value) {
        this._countryCode = value;
    }
    get countryName() {
        return this._countryName;
    }
    set countryName(value) {
        this._countryName = value;
    }
    get address() {
        return this._address;
    }
    set address(value) {
        this._address = value;
    }
    get timeZoneId() {
        return this._timeZoneId;
    }
    set timeZoneId(value) {
        this._timeZoneId = value;
    }
    get timeZoneName() {
        return this._timeZoneName;
    }
    set timeZoneName(value) {
        this._timeZoneName = value;
    }
    get rawOffset() {
        return this._rawOffset;
    }
    set rawOffset(value) {
        this._rawOffset = value;
    }
    get dstOffset() {
        return this._dstOffset;
    }
    set dstOffset(value) {
        this._dstOffset = value;
    }
}
__decorate([
    serializr.serializable
], Location.prototype, "latitude", null);
__decorate([
    serializr.serializable
], Location.prototype, "longtitude", null);
__decorate([
    serializr.serializable
], Location.prototype, "city", null);
__decorate([
    serializr.serializable
], Location.prototype, "countryCode", null);
__decorate([
    serializr.serializable
], Location.prototype, "countryName", null);
__decorate([
    serializr.serializable
], Location.prototype, "address", null);
__decorate([
    serializr.serializable
], Location.prototype, "timeZoneId", null);
__decorate([
    serializr.serializable
], Location.prototype, "timeZoneName", null);
__decorate([
    serializr.serializable
], Location.prototype, "rawOffset", null);
__decorate([
    serializr.serializable
], Location.prototype, "dstOffset", null);
exports.Location = Location;
});

var prayer = createCommonjsModule(function (module, exports) {
var __decorate = (commonjsGlobal && commonjsGlobal.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });



var PrayersName;
(function (PrayersName) {
    PrayersName["IMSAK"] = "Imsak";
    PrayersName["FAJR"] = "Fajr";
    PrayersName["SUNRISE"] = "Sunrise";
    PrayersName["DHUHR"] = "Dhuhr";
    PrayersName["ASR"] = "Asr";
    PrayersName["MAGHRIB"] = "Maghrib";
    PrayersName["SUNSET"] = "Sunset";
    PrayersName["ISHA"] = "Isha";
    PrayersName["MIDNIGHT"] = "Midnight";
})(PrayersName = exports.PrayersName || (exports.PrayersName = {}));
var Schools;
(function (Schools) {
    Schools[Schools["Shafi"] = 0] = "Shafi";
    Schools[Schools["Hanafi"] = 1] = "Hanafi";
})(Schools = exports.Schools || (exports.Schools = {}));
var MidnightMode;
(function (MidnightMode) {
    MidnightMode[MidnightMode["Standard"] = 0] = "Standard";
    MidnightMode[MidnightMode["Jafari"] = 1] = "Jafari";
})(MidnightMode = exports.MidnightMode || (exports.MidnightMode = {}));
var AdjsutmentMethod;
(function (AdjsutmentMethod) {
    AdjsutmentMethod[AdjsutmentMethod["Provider"] = 0] = "Provider";
    AdjsutmentMethod[AdjsutmentMethod["Server"] = 1] = "Server";
    AdjsutmentMethod[AdjsutmentMethod["Client"] = 2] = "Client";
})(AdjsutmentMethod = exports.AdjsutmentMethod || (exports.AdjsutmentMethod = {}));
var LatitudeMethod;
(function (LatitudeMethod) {
    LatitudeMethod[LatitudeMethod["MidNight"] = 1] = "MidNight";
    LatitudeMethod[LatitudeMethod["Seventh"] = 2] = "Seventh";
    LatitudeMethod[LatitudeMethod["Angle"] = 3] = "Angle";
})(LatitudeMethod = exports.LatitudeMethod || (exports.LatitudeMethod = {}));
var Methods;
(function (Methods) {
    Methods[Methods["Shia"] = 0] = "Shia";
    Methods[Methods["Karachi"] = 1] = "Karachi";
    Methods[Methods["America"] = 2] = "America";
    Methods[Methods["MuslimLeague"] = 3] = "MuslimLeague";
    Methods[Methods["Mecca"] = 4] = "Mecca";
    Methods[Methods["Egypt"] = 5] = "Egypt";
    Methods[Methods["Iran"] = 7] = "Iran";
    Methods[Methods["Gulf"] = 8] = "Gulf";
    Methods[Methods["Kuwait"] = 9] = "Kuwait";
    Methods[Methods["Qatar"] = 10] = "Qatar";
    Methods[Methods["Singapore"] = 11] = "Singapore";
    Methods[Methods["France"] = 12] = "France";
    Methods[Methods["Turkey"] = 13] = "Turkey";
    Methods[Methods["Custom"] = 99] = "Custom";
})(Methods = exports.Methods || (exports.Methods = {}));
var PrayerType;
(function (PrayerType) {
    PrayerType["Fardh"] = "Fardh";
    PrayerType["Sunna"] = "Sunna";
})(PrayerType = exports.PrayerType || (exports.PrayerType = {}));
exports.PrayersTypes = [
    { prayerName: PrayersName.FAJR, prayerType: PrayerType.Fardh },
    { prayerName: PrayersName.DHUHR, prayerType: PrayerType.Fardh },
    { prayerName: PrayersName.ASR, prayerType: PrayerType.Fardh },
    { prayerName: PrayersName.MAGHRIB, prayerType: PrayerType.Fardh },
    { prayerName: PrayersName.ISHA, prayerType: PrayerType.Fardh },
    { prayerName: PrayersName.SUNRISE, prayerType: PrayerType.Sunna },
    { prayerName: PrayersName.SUNSET, prayerType: PrayerType.Sunna },
    { prayerName: PrayersName.IMSAK, prayerType: PrayerType.Sunna },
    { prayerName: PrayersName.MIDNIGHT, prayerType: PrayerType.Sunna },
];
class PrayerAdjustment {
    get prayerName() {
        return this._prayerName;
    }
    set prayerName(value) {
        this._prayerName = value;
    }
    get adjustments() {
        return this._adjustments;
    }
    set adjustments(value) {
        this._adjustments = value;
    }
}
__decorate([
    serializr.serializable(serializr.identifier())
], PrayerAdjustment.prototype, "prayerName", null);
__decorate([
    serializr.serializable
], PrayerAdjustment.prototype, "adjustments", null);
class PrayersMidnight {
    get id() {
        return this._id;
    }
    set id(value) {
        this._id = value;
    }
    get midnight() {
        return this._midnight;
    }
    set midnight(value) {
        this._midnight = value;
    }
}
__decorate([
    serializr.serializable(serializr.identifier())
], PrayersMidnight.prototype, "id", null);
__decorate([
    serializr.serializable
], PrayersMidnight.prototype, "midnight", null);
class PrayerAdjustmentMethod {
    get id() {
        return this._id;
    }
    set id(value) {
        this._id = value;
    }
    get adjustmentMethod() {
        return this._adjustmentMethod;
    }
    set adjustmentMethod(value) {
        this._adjustmentMethod = value;
    }
}
__decorate([
    serializr.serializable(serializr.identifier())
], PrayerAdjustmentMethod.prototype, "id", null);
__decorate([
    serializr.serializable
], PrayerAdjustmentMethod.prototype, "adjustmentMethod", null);
class PrayerLatitude {
    get id() {
        return this._id;
    }
    set id(value) {
        this._id = value;
    }
    get latitudeMethod() {
        return this._latitudeMethod;
    }
    set latitudeMethod(value) {
        this._latitudeMethod = value;
    }
}
__decorate([
    serializr.serializable(serializr.identifier())
], PrayerLatitude.prototype, "id", null);
__decorate([
    serializr.serializable
], PrayerLatitude.prototype, "latitudeMethod", null);
class PrayerSchools {
    get id() {
        return this._id;
    }
    set id(value) {
        this._id = value;
    }
    get school() {
        return this._school;
    }
    set school(value) {
        this._school = value;
    }
}
__decorate([
    serializr.serializable(serializr.identifier())
], PrayerSchools.prototype, "id", null);
__decorate([
    serializr.serializable
], PrayerSchools.prototype, "school", null);
class PrayersMethods {
    get id() {
        return this._id;
    }
    set id(value) {
        this._id = value;
    }
    get methodName() {
        return this._methodName;
    }
    set methodName(value) {
        this._methodName = value;
    }
}
__decorate([
    serializr.serializable(serializr.identifier())
], PrayersMethods.prototype, "id", null);
__decorate([
    serializr.serializable
], PrayersMethods.prototype, "methodName", null);
class PrayersTiming {
    get prayerName() {
        return this._prayerName;
    }
    set prayerName(value) {
        this._prayerName = value;
    }
    get prayerTime() {
        return this._prayerTime;
    }
    set prayerTime(value) {
        this._prayerTime = value;
    }
}
__decorate([
    serializr.serializable(serializr.identifier())
], PrayersTiming.prototype, "prayerName", null);
__decorate([
    serializr.serializable(serializr.date())
], PrayersTiming.prototype, "prayerTime", null);
exports.PrayersTiming = PrayersTiming;
class Prayers {
    constructor(prayerTime) {
        if (!isNullOrUndefined_1.isNullOrUndefined(prayerTime))
            this._prayerTime = prayerTime;
        else
            this._prayerTime = new Array();
    }
    get prayerTime() {
        return this._prayerTime;
    }
    set prayerTime(value) {
        this._prayerTime = value;
    }
    get prayersDate() {
        return this._prayersDate;
    }
    set prayersDate(value) {
        this._prayersDate = value;
    }
    toJSON() {
        return {
            prayerTime: this._prayerTime,
            prayersDate: this._prayersDate
        };
    }
}
__decorate([
    serializr.serializable(serializr.list(serializr.object(PrayersTiming)))
], Prayers.prototype, "prayerTime", null);
__decorate([
    serializr.serializable(serializr.date())
], Prayers.prototype, "prayersDate", null);
exports.Prayers = Prayers;
class PrayersSettings {
    constructor(prayersSettings) {
        if (!isNullOrUndefined_1.isNullOrUndefined(prayersSettings))
            this._prayersSettings = prayersSettings;
        else {
            this._method = new PrayersMethods();
            this._adjustments = new Array();
            this._midnight = new PrayersMidnight();
            this._school = new PrayerSchools();
            this._adjustmentMethod = new PrayerAdjustmentMethod();
            this._latitudeAdjustment = new PrayerLatitude();
        }
    }
    get adjustmentMethod() {
        return this._adjustmentMethod;
    }
    set adjustmentMethod(value) {
        this._adjustmentMethod = value;
    }
    get startDate() {
        return this._startDate;
    }
    set startDate(value) {
        this._startDate = value;
    }
    get endDate() {
        return this._endDate;
    }
    set endDate(value) {
        this._endDate = value;
    }
    get adjustments() {
        return this._adjustments;
    }
    set adjustments(value) {
        this._adjustments = value;
    }
    get method() {
        return this._method;
    }
    set method(value) {
        this._method = value;
    }
    get school() {
        return this._school;
    }
    set school(value) {
        this._school = value;
    }
    get midnight() {
        return this._midnight;
    }
    set midnight(value) {
        this._midnight = value;
    }
    get latitudeAdjustment() {
        return this._latitudeAdjustment;
    }
    set latitudeAdjustment(value) {
        this._latitudeAdjustment = value;
    }
    toJSON() {
        return {
            midnight: this._midnight,
            school: this._school,
            latitudeAdjustment: this._latitudeAdjustment,
            method: this._method,
            startDate: this._startDate,
            adjustmentMethod: this._adjustmentMethod,
            endDate: this._endDate,
            adjustments: this._adjustments
        };
    }
}
__decorate([
    serializr.serializable(serializr.object(PrayerAdjustmentMethod))
], PrayersSettings.prototype, "adjustmentMethod", null);
__decorate([
    serializr.serializable(serializr.date())
], PrayersSettings.prototype, "startDate", null);
__decorate([
    serializr.serializable(serializr.date())
], PrayersSettings.prototype, "endDate", null);
__decorate([
    serializr.serializable(serializr.list(serializr.object(PrayerAdjustment)))
], PrayersSettings.prototype, "adjustments", null);
__decorate([
    serializr.serializable(serializr.object(PrayersMethods))
], PrayersSettings.prototype, "method", null);
__decorate([
    serializr.serializable(serializr.object(PrayerSchools))
], PrayersSettings.prototype, "school", null);
__decorate([
    serializr.serializable(serializr.object(PrayersMidnight))
], PrayersSettings.prototype, "midnight", null);
__decorate([
    serializr.serializable(serializr.object(PrayerLatitude))
], PrayersSettings.prototype, "latitudeAdjustment", null);
exports.PrayersSettings = PrayersSettings;
class PrayersTime {
    //prayer constructors, with timing,
    constructor(prayers, locationSettings, prayerConfig) {
        this._location = locationSettings;
        this._prayers = prayers;
        this._pareyerSettings = prayerConfig;
    }
    get location() {
        return this._location;
    }
    set location(value) {
        this._location = value;
    }
    get pareyerSettings() {
        return this._pareyerSettings;
    }
    set pareyerSettings(value) {
        this._pareyerSettings = value;
    }
    get prayers() {
        return this._prayers;
    }
    set prayers(value) {
        this._prayers = value;
    }
}
__decorate([
    serializr.serializable(serializr.object(location_1.Location))
], PrayersTime.prototype, "location", null);
__decorate([
    serializr.serializable(serializr.object(PrayersSettings))
], PrayersTime.prototype, "pareyerSettings", null);
__decorate([
    serializr.serializable(serializr.list(serializr.object(Prayers)))
], PrayersTime.prototype, "prayers", null);
exports.PrayersTime = PrayersTime;
});

export { isNullOrUndefined_1 as i, prayer as p };
//# sourceMappingURL=prayer-d4b44e7e.js.map

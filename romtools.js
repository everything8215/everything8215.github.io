// 
// romtools.js
// created 1/4/2018
// 

// ROMObject
function ROMObject(rom, definition, parent) {

    this.rom = rom;
    this.type = definition.type;
    this.key = definition.key;
    this.name = definition.name;
    this.parent = parent;
    this.observers = [];
}

ROMObject.Type = {
    object: "object",
    assembly: "assembly",
    rom: "rom",
    data: "data",
    property: "property",
    array: "array",
    pointerTable: "pointerTable",
    reference: "reference",
    script: "script",
    scriptEncoding: "scriptEncoding",
    text: "text",
    textEncoding: "textEncoding",
    stringTable: "stringTable"
};

// ROMObject factory method
ROMObject.create = function(rom, definition, parent) {
    switch (definition.type) {
    case ROMObject.Type.assembly:
        return new ROMAssembly(rom, definition, parent);
    case ROMObject.Type.rom:
        return new ROM(rom, definition, parent);
    case ROMObject.Type.data:
        return new ROMData(rom, definition, parent);
    case ROMObject.Type.property:
        return new ROMProperty(rom, definition, parent);
    case ROMObject.Type.array:
        return new ROMArray(rom, definition, parent);
    case ROMObject.Type.pointerTable:
        return new ROMPointerTable(rom, definition, parent);
    case ROMObject.Type.reference:
        return new ROMReference(rom, definition, parent);
    case ROMObject.Type.script:
        return new ROMScript(rom, definition, parent);
    case ROMObject.Type.scriptEncoding:
        return new ROMScriptEncoding(rom, definition, parent);
    case ROMObject.Type.text:
        return new ROMText(rom, definition, parent);
    case ROMObject.Type.textEncoding:
        return new ROMTextEncoding(rom, definition, parent);
    case ROMObject.Type.stringTable:
        return new ROMStringTable(rom, definition, parent);
    default:
        return new ROMAssembly(rom, definition, parent);
    }
};

Object.defineProperty(ROMObject.prototype, "definition", { get: function() {
    var definition = {};

    definition.type = this.type;
    definition.key = this.key;
    definition.name = this.name;

    return definition;
}});

ROMObject.prototype.copy = function(parent) {
    return ROMObject.create(this.rom, this.definition, parent);
}

ROMObject.prototype.addObserver = function(object, callback, args) {
    for (var o = 0; o < this.observers.length; o++) {
        if (this.observers[o].object === object) return;
    }
    this.observers.push({object: object, callback: callback, args: args});
}

ROMObject.prototype.removeObserver = function(object) {
    this.observers = this.observers.filter(function(observer) {
        return (observer.object !== object);
    });
}

ROMObject.prototype.notifyObservers = function() {
    this.observers.forEach(function(observer) {
        observer.callback.apply(observer.object, observer.args);
    });
}

// ROMAssembly
function ROMAssembly(rom, definition, parent) {
    
    ROMObject.call(this, rom, definition, parent);
    
    this.isLoaded = false;
    this.isDirty = false;
    
    // range
    this.range = ROMRange.parse(definition.range);
    
    // begin
    if (definition.begin) {
        var begin = Number(definition.begin);
        if (isNumber(begin)) {
            this.range.begin = begin;
            this.range.end = begin + 1;
        }
    }
    
    if (definition.end) {
        // end
        var end = Number(definition.end);
        if (isNumber(end)) {
            this.range.end = end;
        }
        
    } else if (definition.length) {
        // length
        var length = Number(definition.length);
        if (isNumber(length)) {
            this.range.end = this.range.begin + length;
        }
    }
    
    // parent
//    this.parent = parent;
    
    // create the string table
    if (isString(definition.stringTable)) {
        this.stringTable = definition.stringTable;
    } else if (definition.stringTable && rom !== this) {
        rom.stringTable[this.path] = new ROMStringTable(this.rom, definition.stringTable);
        this.stringTable = this.path;
    }

    this.format = definition.format;
    this.reference = [];
    this._invalid = definition.invalid || false;
    this._hidden = definition.hidden || false;
    this._disabled = definition.disabled || false;
}

ROMAssembly.prototype = Object.create(ROMObject.prototype);
ROMAssembly.prototype.constructor = ROMAssembly;

Object.defineProperty(ROMAssembly.prototype, "definition", { get: function() {
    var definition = Object.getOwnPropertyDescriptor(ROMObject.prototype, "definition").get.call(this);
    
    if (!this.range.isEmpty) {
        definition.range = this.range.toString();
    }
    
    if (this.stringTable) definition.stringTable = this.stringTable;
    if (this.format) definition.format = this.format;
    if (this._invalid) definition.invalid = this._invalid;
    if (this._hidden) definition.hidden = this._hidden;
    if (this._disabled) definition.disabled = this._disabled;
    
    return definition;
}});

Object.defineProperty(ROMAssembly.prototype, "assembledLength", { get: function() {
    
    if (!this.lazyData) this.assemble();
    
    // update the assembly's range
    this.range.end = this.range.begin + this.lazyData.length;
    return this.lazyData.length;
}});

Object.defineProperty(ROMAssembly.prototype, "path", { get: function() {
    if (!this.parent || this.parent === this.rom) {
        return this.key;
    } else if (this.parent instanceof ROMArray) {
        return this.parent.path + ".assembly";
    } else if (this instanceof ROMCommand) {
        return this.parent.path + "." + this.encoding + "." + this.key;
    }
    return this.parent.path + "." + this.key;
}});

// invalid: assembly is not shown in property view and will not be assembled
Object.defineProperty(ROMAssembly.prototype, "invalid", { get: function() {
    if (isString(this._invalid)) return eval(this._invalid);
    return this._invalid;
}, set: function(invalid) {
    this._invalid = invalid;
}});

// hidden: assembly is not shown in property view but will still get assembled
Object.defineProperty(ROMAssembly.prototype, "hidden", { get: function() {
    if (isString(this._hidden)) return eval(this._hidden);
    return this._hidden;
}, set: function(hidden) {
    this._hidden = hidden;
}});

// disabled: assembly is disabled in property view and will not be assembled
Object.defineProperty(ROMAssembly.prototype, "disabled", { get: function() {
    if (isString(this._disabled)) return eval(this._disabled);
    return this._disabled;
}, set: function(disabled) {
    this._disabled = disabled;
}});

ROMAssembly.prototype.updateReferences = function() {
    for (var r = 0; r < this.reference.length; r++) {
        this.reference[r].update();
    }
}

ROMAssembly.prototype.assemble = function(data) {

    // compress the data if needed
    if (!this.lazyData) this.lazyData = ROMAssembly.encode(this.data, this.format);

    // return if just updating data
    if (!data) return;
    
    // map ranges for children of the ROM
    var range = this.range;
    if (this.parent === this.rom) range = this.rom.mapRange(range);

    if ((range.begin + this.assembledLength) > data.length) {
        // uh-oh, this assembly won't fit in its range
        this.rom.log(this.name + " will not fit in its range.")
        return;
    }

    // copy the assembly into its parent and validate
    data.set(this.lazyData, range.begin);
}

ROMAssembly.prototype.disassemble = function(data) {
    
    if (!this.range) this.range = new ROMRange(0, 0);
    var range = this.range;

    // map ranges for children of the ROM
    if (this.parent === this.rom) range = this.rom.mapRange(range);
    
    // validate the range vs. the input data
    if (range.begin > data.length) {
        // beginning of range is past the end of the data
//        this.rom.log("Invalid range " + range.toString() + " for data of length " + data.length);
        range.begin = 0;
        range.end = 0;
    } else if (range.end > data.length) {
        // end of range is past the end of the data
//        this.rom.log("Range " + range.toString() + " exceeds data length " + hexString(data.length, 6));
        range.end = data.length;
    }
    
    // copy the appropriate range of data
    this.lazyData = data.slice(range.begin, range.end);
    this.data = ROMAssembly.decode(this.lazyData, this.format);
    this.isLoaded = true;
}

ROMAssembly.encode = function(data, format) {
    // return if the data is not compressed
    if (!format) return data;
    
    if (isArray(format)) {
        // multi-pass encoding format
        for (var i = 0; i < format.length; i++) {
            data = ROMAssembly.encode(data, format[i]);
        }
        return data;
    }
    
    // parse the format name
    var formatName = format.match(/[^\(]+/);
    if (!isArray(formatName)) return data;
    formatName = formatName[0];
    var f = ROM.dataFormat[formatName];
    if (!f) return data;
    
    // parse arguments
    var args = [data];
    var argsList = format.match(/\([^\)]+\)/);
    if (isArray(argsList)) {
        argsList = argsList[0];
        argsList = argsList.substring(1, argsList.length - 1).split(",");
        argsList.forEach(function(arg, i) {
            args.push(Number(arg));
        });
    }
    return f.encode.apply(null, args);
}

ROMAssembly.decode = function(data, format) {
    // return if the data is not compressed
    if (!format) return data;
    
    if (isArray(format)) {
        // multi-pass encoding format
        for (var i = format.length - 1; i >= 0; i--) {
            data = ROMAssembly.decode(data, format[i]);
        }
        return data;
    }
    
    // parse the format name
    var formatName = format.match(/[^\(]+/);
    if (!isArray(formatName)) return data;
    formatName = formatName[0];
    var f = ROM.dataFormat[formatName];
    if (!f) return data;
    
    // parse arguments
    var args = [data];
    var argsList = format.match(/\([^\)]+\)/);
    if (isArray(argsList)) {
        argsList = argsList[0];
        argsList = argsList.substring(1, argsList.length - 1).split(",");
        argsList.forEach(function(arg, i) {
            args.push(Number(arg));
        });
    }
    return f.decode.apply(null, args);
}

ROMAssembly.prototype.markAsDirty = function() {
    this.lazyData = null;
    this.isDirty = true;
    if (this.parent && this.parent.markAsDirty) this.parent.markAsDirty();
}

ROMAssembly.prototype.setData = function(array, offset) {

    // return if the array didn't change
    var oldArray = this.data.slice(offset, offset + array.length);
    if (compareTypedArrays(oldArray, array)) return;

    // perform an action to set the array
    var assembly = this;
    function redo() {
        assembly.data.set(array, offset);
        assembly.notifyObservers();
    }
    function undo() {
        assembly.data.set(oldArray, offset);
        assembly.notifyObservers();
    }
    var description = "Set " + this.name + " data [" + offset.toString() + "-" + (offset + array.length).toString() + "]";
    var action = new ROMAction(this, undo, redo, description);
    this.rom.doAction(action);
}

// ROMReference
function ROMReference(rom, definition, parent) {
    ROMObject.call(this, rom, definition, parent);
    this.type = ROMObject.Type.reference;
    
    // the reference's parent is the source of the value
    this.target = definition.target; // the object that the reference will be written to
    this.options = definition.options; // options to determine the value
}

ROMReference.prototype.update = function() {
    if (this.target instanceof ROMProperty) {
        var value = this.value;
        if (this.target.value === value) return;
        this.target.value = value;
        this.target.markAsDirty();
    }
}

Object.defineProperty(ROMReference.prototype, "value", { get: function() {
    var value = 0;
    
    if (!this.parent) return 0;
    
    if (this.options.address) {
        value = this.parent.range.begin;
        if (this.options.mapped) value = this.rom.unmapAddress(value);
        else if (this.options.relative) value -= this.options.relative.range.begin;
    } else if (this.options.arrayLength) {
        value = this.parent.array.length;
    } else if (this.options.dataLength) {
        value = this.parent.data.length;
    } else if (this.options.eval) {
        value = eval(options.eval);
    }
    
    if (this.options.mask) value &= this.options.mask;
    if (this.options.shift) value <<= this.options.shift;
    if (this.options.multiplier) value *= this.options.multiplier;
    if (this.options.offset) value += this.options.offset;
    
    return value;
}});

// ROMData
function ROMData(rom, definition, parent) {
    ROMAssembly.call(this, rom, definition, parent);
    
    this.assembly = {};

    // return if there are no sub-assemblies
    if (!definition.assembly) return;
    var keys = Object.keys(definition.assembly);
    if (!keys) return;
        
    for (var i = 0; i < keys.length; i++) {
        var key = keys[i];
        var assemblyDefinition = definition.assembly[key];
        if (!isString(key)) continue;
        if (!assemblyDefinition.type) assemblyDefinition.type = ROMObject.Type.assembly;
        assemblyDefinition.key = key;
        this.addAssembly(assemblyDefinition);
        
//        var assembly = ROMObject.create(rom, assemblyDefinition, this);
//        assembly.parent = this;
//        this.assembly[key] = assembly;
//        
//        if (assembly.pointerTable) {
//            assembly.pointerTable.parent = this;
//            this.assembly[assembly.pointerTable.key] = assembly.pointerTable;
//        }
//        
//        // create a lazy getter function for this assembly
//        function getter(assembly) {
//            return function() {
//                // disassemble this assembly if it hasn't been loaded yet
//                if (!assembly.isLoaded && assembly.disassemble) {
//                    assembly.disassemble(this.data);
//                }
//                return assembly;
//            }
//        }
//        Object.defineProperty(this, key, { get: getter(assembly) });
    }
}

ROMData.prototype = Object.create(ROMAssembly.prototype);
ROMData.prototype.constructor = ROMData;

Object.defineProperty(ROMData.prototype, "definition", { get: function() {
    var definition = Object.getOwnPropertyDescriptor(ROMAssembly.prototype, "definition").get.call(this);
    
    var keys = Object.keys(this.assembly);
    if (keys.length != 0) {
        definition.assembly = {};
        for (var i = 0; i < keys.length; i++) {
            var key = keys[i];
            var assembly = this.assembly[key];
//            if (assembly.type === ROMObject.Type.pointerTable) continue;
            var assemblyDefinition = this.assembly[key].definition;
            delete assemblyDefinition.key;
            definition.assembly[key] = assemblyDefinition;
        }
    }
    
    return definition;
}});

ROMData.prototype.updateReferences = function() {

    // update references for children
    var keys = Object.keys(this.assembly);
    for (var i = 0; i < keys.length; i++) {
        var assembly = this.assembly[keys[i]];
        if (!assembly.isDirty || assembly.invalid || assembly.disabled) continue;
        if (assembly.updateReferences) assembly.updateReferences();
    }
    
    ROMAssembly.prototype.updateReferences.call(this);
}

ROMData.prototype.assemble = function(data) {

    // assemble children
    var keys = Object.keys(this.assembly);
    for (var i = 0; i < keys.length; i++) {
        var assembly = this.assembly[keys[i]];
        if (!assembly.isDirty || assembly.invalid || assembly.disabled) continue;
        if (assembly.assemble) assembly.assemble(this.data);
        assembly.isDirty = false;
    }
    
    ROMAssembly.prototype.assemble.call(this, data);
}

ROMData.prototype.addAssembly = function(definition) {
    var key = definition.key;
    if (!key) return;
    var assembly = ROMObject.create(this.rom, definition, this);
    assembly.parent = this;
    this.assembly[key] = assembly;

//    if (assembly.pointerTable) {
//        assembly.pointerTable.parent = this;
//        this.assembly[assembly.pointerTable.key] = assembly.pointerTable;
//    }

    // create a lazy getter function for this assembly
    function getter(assembly) {
        return function() {
            // disassemble this assembly if it hasn't been loaded yet
            if (!assembly.isLoaded && assembly.disassemble) {
                assembly.disassemble(this.data);
            }
            return assembly;
        }
    }
    Object.defineProperty(this, key, { get: getter(assembly) });
}

// ROM
function ROM(rom, definition) {

    this.crc32 = Number(definition.crc32);
    this.system = definition.system;
    this.mode = definition.mode;
    this.pointerLength = Number(definition.pointerLength);
    if (!isNumber(this.pointerLength)) { this.pointerLength = 2; }
    this.pad = Number(definition.pad);
    if (!isNumber(this.pad)) { this.pad = 0xFF; }

    var i, key, keys;
    
    // copy character tables
    this.charTable = {};
    if (definition.charTable) {
        keys = Object.keys(definition.charTable);
        for (i = 0; i < keys.length; i++) {
            key = keys[i];
            definition.charTable[key].key = key;
            this.charTable[key] = new ROMCharTable(this, definition.charTable[key], this);
        }
    }
    
    // create text encodings
    this.textEncoding = {};
    if (definition.textEncoding) {
        keys = Object.keys(definition.textEncoding);
        for (i = 0; i < keys.length; i++) {
            key = keys[i];
            definition.textEncoding[key].key = key;
            this.textEncoding[key] = new ROMTextEncoding(this, definition.textEncoding[key], this);
        }
    }

    // load string tables
    this.stringTable = {};
    if (definition.stringTable) {
        keys = Object.keys(definition.stringTable);
        for (i = 0; i < keys.length; i++) {
            key = keys[i];
            definition.stringTable[key].key = key;
            this.stringTable[key] = new ROMStringTable(this, definition.stringTable[key], this);
        }
    }

    // create script encodings
    this.scriptEncoding = {};
    if (definition.scriptEncoding) {
        keys = Object.keys(definition.scriptEncoding);
        for (i = 0; i < keys.length; i++) {
            key = keys[i];
            definition.scriptEncoding[key].key = key;
            this.scriptEncoding[key] = new ROMScriptEncoding(this, definition.scriptEncoding[key], this);
        }
    }
    
    this.observer = new ROMObserver(this, this, {sub: true});
    this.selection = [];

    // create the assemblies
    ROMData.call(this, this, definition);
}

ROM.prototype = Object.create(ROMData.prototype);
ROM.prototype.constructor = ROM;

Object.defineProperty(ROM.prototype, "definition", { get: function() {
    var definition = Object.getOwnPropertyDescriptor(ROMData.prototype, "definition").get.call(this);

    delete definition.range;
    definition.length = hexString(this.data.length);
    definition.crc32 = hexString(ROM.crc32(this.data), 8);
    definition.system = this.system;
    definition.mode = this.mode;
    if (this.pointerLength != 2) { definition.pointerLength = this.pointerLength; }
    if (this.pad != 0xFF) { definition.pad = hexString(this.pad, 1); }
    
    // create string table definitions
    definition.stringTable = [];
    for (var i = 0; i < this.stringTable.length; i++) {
        var stringTable = this.stringTable[i];
        if (definition.assembly[stringTable.key]) {
            definition.assembly[stringTable.key].stringTable = stringTable.definition;
        } else {
            definition.stringTable[stringTable.key] = stringTable.definition;
        }
    }
    
    return definition;
}});

ROM.prototype.assemble = function(data) {

    // mark modified assemblies as dirty
    function markDirty(action) {
        
        if (isArray(action)) {
            action.forEach(markDirty);
            return;
        }
        if (!action.object || !action.object.markAsDirty) return;
        action.object.markAsDirty();
    }
    
    this.undoStack.forEach(markDirty);
    this.redoStack.forEach(markDirty);
    
    // right here is where i need to implement auto-relocation
    
    this.updateReferences();
    
    ROMData.prototype.assemble.call(this, data);
    
    this.fixChecksum();
    data = this.data;
}

ROM.prototype.log = function(text) {
    console.log(text);
}

ROM.System = {
    none: "none",
    sfc: "sfc",
    gba: "gba",
    psx: "psx"
}

Object.defineProperty(ROM.prototype, "isSFC", { get: function() { return this.system === ROM.System.sfc; } });
Object.defineProperty(ROM.prototype, "isGBA", { get: function() { return this.system === ROM.System.gba; } });
Object.defineProperty(ROM.prototype, "isPSX", { get: function() { return this.system === ROM.System.psx; } });

ROM.MapMode = {
    none: "none",
    loROM: "loROM",
    hiROM: "hiROM",
    gba: "gba",
    psx: "psx"
}

ROM.prototype.mapAddress = function(address) {
    switch (this.mode) {
        case ROM.MapMode.loROM:
            var bank = address & 0xFF0000;
            return (bank >> 1) | (address & 0x7FFF);

        case ROM.MapMode.hiROM:
            if (address >= 0xC00000) {
                return address - 0xC00000;
            }
            else if (address >= 0x800000) {
                return address - 0x800000;
            } else {
                return address;
            }

        case ROM.MapMode.gba:
            if (address >= 0x08000000) {
                return address - 0x08000000;
            } else {
                return address;
            }

        case ROM.MapMode.None:
        default:
            return address;
    }
}

ROM.prototype.mapRange = function(range) {
    var begin = this.mapAddress(range.begin);
    var end = this.mapAddress(range.end);
    return new ROMRange(begin, end);
}

ROM.prototype.unmapAddress = function(address) {
    return address;
}

ROM.prototype.unmapRange = function(range) {
    var begin = this.unmapAddress(range.begin);
    var end = this.unmapAddress(range.end);
    return new ROMRange(begin, end);
}

ROM.prototype.fixChecksum = function() {
    if (!this.isSFC || !this.snesHeader) return;
    
    this.snesHeader.checksum.value = 0;
    this.snesHeader.checksumInverse.value = 0xFFFF;
    
    var checksum = ROM.checksum(this.data);
    this.snesHeader.checksum.value = checksum;
    this.snesHeader.checksumInverse.value = checksum ^ 0xFFFF;
    
    this.snesHeader.assemble(this.data);
}

ROM.checksum = function(data) {

    function calcSum(data) {
        var sum = 0;
        for (var i = 0; i < data.length; i++) sum += data[i];
        return sum & 0xFFFF;
    }
    
    function mirrorSum(data, mask) {
        while (!(data.length & mask)) mask >>= 1;
        
        var part1 = calcSum(data.slice(0, mask));
        var part2 = 0;
        
        var nextLength = data.length - mask;
        if (nextLength) {
            part2 = mirrorSum(data.slice(mask), nextLength, mask >> 1);
            
            while (nextLength < mask) {
                nextLength += nextLength;
                part2 += part2;
            }
        }
        return (part1 + part2) & 0xFFFF;
    }
    
    return mirrorSum(data, 0x800000);
}

ROM.crc32Table = [
    0x00000000, 0x77073096, 0xee0e612c, 0x990951ba, 0x076dc419, 0x706af48f,
    0xe963a535, 0x9e6495a3, 0x0edb8832, 0x79dcb8a4, 0xe0d5e91e, 0x97d2d988,
    0x09b64c2b, 0x7eb17cbd, 0xe7b82d07, 0x90bf1d91, 0x1db71064, 0x6ab020f2,
    0xf3b97148, 0x84be41de, 0x1adad47d, 0x6ddde4eb, 0xf4d4b551, 0x83d385c7,
    0x136c9856, 0x646ba8c0, 0xfd62f97a, 0x8a65c9ec, 0x14015c4f, 0x63066cd9,
    0xfa0f3d63, 0x8d080df5, 0x3b6e20c8, 0x4c69105e, 0xd56041e4, 0xa2677172,
    0x3c03e4d1, 0x4b04d447, 0xd20d85fd, 0xa50ab56b, 0x35b5a8fa, 0x42b2986c,
    0xdbbbc9d6, 0xacbcf940, 0x32d86ce3, 0x45df5c75, 0xdcd60dcf, 0xabd13d59,
    0x26d930ac, 0x51de003a, 0xc8d75180, 0xbfd06116, 0x21b4f4b5, 0x56b3c423,
    0xcfba9599, 0xb8bda50f, 0x2802b89e, 0x5f058808, 0xc60cd9b2, 0xb10be924,
    0x2f6f7c87, 0x58684c11, 0xc1611dab, 0xb6662d3d, 0x76dc4190, 0x01db7106,
    0x98d220bc, 0xefd5102a, 0x71b18589, 0x06b6b51f, 0x9fbfe4a5, 0xe8b8d433,
    0x7807c9a2, 0x0f00f934, 0x9609a88e, 0xe10e9818, 0x7f6a0dbb, 0x086d3d2d,
    0x91646c97, 0xe6635c01, 0x6b6b51f4, 0x1c6c6162, 0x856530d8, 0xf262004e,
    0x6c0695ed, 0x1b01a57b, 0x8208f4c1, 0xf50fc457, 0x65b0d9c6, 0x12b7e950,
    0x8bbeb8ea, 0xfcb9887c, 0x62dd1ddf, 0x15da2d49, 0x8cd37cf3, 0xfbd44c65,
    0x4db26158, 0x3ab551ce, 0xa3bc0074, 0xd4bb30e2, 0x4adfa541, 0x3dd895d7,
    0xa4d1c46d, 0xd3d6f4fb, 0x4369e96a, 0x346ed9fc, 0xad678846, 0xda60b8d0,
    0x44042d73, 0x33031de5, 0xaa0a4c5f, 0xdd0d7cc9, 0x5005713c, 0x270241aa,
    0xbe0b1010, 0xc90c2086, 0x5768b525, 0x206f85b3, 0xb966d409, 0xce61e49f,
    0x5edef90e, 0x29d9c998, 0xb0d09822, 0xc7d7a8b4, 0x59b33d17, 0x2eb40d81,
    0xb7bd5c3b, 0xc0ba6cad, 0xedb88320, 0x9abfb3b6, 0x03b6e20c, 0x74b1d29a,
    0xead54739, 0x9dd277af, 0x04db2615, 0x73dc1683, 0xe3630b12, 0x94643b84,
    0x0d6d6a3e, 0x7a6a5aa8, 0xe40ecf0b, 0x9309ff9d, 0x0a00ae27, 0x7d079eb1,
    0xf00f9344, 0x8708a3d2, 0x1e01f268, 0x6906c2fe, 0xf762575d, 0x806567cb,
    0x196c3671, 0x6e6b06e7, 0xfed41b76, 0x89d32be0, 0x10da7a5a, 0x67dd4acc,
    0xf9b9df6f, 0x8ebeeff9, 0x17b7be43, 0x60b08ed5, 0xd6d6a3e8, 0xa1d1937e,
    0x38d8c2c4, 0x4fdff252, 0xd1bb67f1, 0xa6bc5767, 0x3fb506dd, 0x48b2364b,
    0xd80d2bda, 0xaf0a1b4c, 0x36034af6, 0x41047a60, 0xdf60efc3, 0xa867df55,
    0x316e8eef, 0x4669be79, 0xcb61b38c, 0xbc66831a, 0x256fd2a0, 0x5268e236,
    0xcc0c7795, 0xbb0b4703, 0x220216b9, 0x5505262f, 0xc5ba3bbe, 0xb2bd0b28,
    0x2bb45a92, 0x5cb36a04, 0xc2d7ffa7, 0xb5d0cf31, 0x2cd99e8b, 0x5bdeae1d,
    0x9b64c2b0, 0xec63f226, 0x756aa39c, 0x026d930a, 0x9c0906a9, 0xeb0e363f,
    0x72076785, 0x05005713, 0x95bf4a82, 0xe2b87a14, 0x7bb12bae, 0x0cb61b38,
    0x92d28e9b, 0xe5d5be0d, 0x7cdcefb7, 0x0bdbdf21, 0x86d3d2d4, 0xf1d4e242,
    0x68ddb3f8, 0x1fda836e, 0x81be16cd, 0xf6b9265b, 0x6fb077e1, 0x18b74777,
    0x88085ae6, 0xff0f6a70, 0x66063bca, 0x11010b5c, 0x8f659eff, 0xf862ae69,
    0x616bffd3, 0x166ccf45, 0xa00ae278, 0xd70dd2ee, 0x4e048354, 0x3903b3c2,
    0xa7672661, 0xd06016f7, 0x4969474d, 0x3e6e77db, 0xaed16a4a, 0xd9d65adc,
    0x40df0b66, 0x37d83bf0, 0xa9bcae53, 0xdebb9ec5, 0x47b2cf7f, 0x30b5ffe9,
    0xbdbdf21c, 0xcabac28a, 0x53b39330, 0x24b4a3a6, 0xbad03605, 0xcdd70693,
    0x54de5729, 0x23d967bf, 0xb3667a2e, 0xc4614ab8, 0x5d681b02, 0x2a6f2b94,
    0xb40bbe37, 0xc30c8ea1, 0x5a05df1b, 0x2d02ef8d ];

// CRC32 for uint8 arrays
ROM.crc32 = function(data) {
    var crc32 = ~0;
    for (var i = 0; i < data.length; i++)
        crc32 = ((crc32 >> 8) & 0x00FFFFFF) ^ ROM.crc32Table[(crc32 ^ data[i]) & 0xFF];

    return (~crc32) >>> 0;
}

ROM.dataFormat = {
    "none": {
        encode: function(data) { return data; },
        decode: function(data) { return data; }
    },
    "linear2bpp": {
        encode: GFX.encodeLinear2bpp,
        decode: GFX.decodeLinear2bpp
    },
    "linear4bpp": {
        encode: GFX.encodeLinear4bpp,
        decode: GFX.decodeLinear4bpp
    },
    "bgr555": {
        encode: GFX.encodeBGR555,
        decode: GFX.decodeBGR555
    },
    "snes2bpp": {
        encode: GFX.encodeSNES2bpp,
        decode: GFX.decodeSNES2bpp
    },
    "snes3bpp": {
        encode: GFX.encodeSNES3bpp,
        decode: GFX.decodeSNES3bpp
    },
    "snes4bpp": {
        encode: GFX.encodeSNES4bpp,
        decode: GFX.decodeSNES4bpp
    },
    "interlace": {
        encode: function(data, word, layers, stride) {
            var src = data;
            var s = 0;
            var dest = new Uint8Array(data.length);
            var d = 0;
            var step = word * layers; // 2
            var block = word * stride * layers; // 512
            while (s < src.length) {
                var s1 = s;
                while (s1 < step) {
                    var s2 = s1;
                    while (s2 < block) {
                        dest.set(src.slice(s2, s2 + word), d);
                        d += word;
                        s2 += step;
                    }
                    s1 += word;
                }
                s += block;
            }
            
            return dest;
        },
        decode: function(data, word, layers, stride) {
            var src = data;
            var s = 0;
            var dest = new Uint8Array(data.length);
            var d = 0;
            var block = word * stride * layers; // 512
            while (s < src.length) {
                var s1 = s;
                while (s1 < stride) {
                    var s2 = s1;
                    while (s2 < block) {
                        dest.set(src.slice(s2, s2 + word), d);
                        d += word;
                        s2 += stride;
                    }
                    s1 += word;
                }
                s += block;
            }
            
            return dest;
        }
    },
    "ff4-world": {
        encode: function(data) {
            var src = data;
            var s = 0; // source pointer
            var dest = new Uint8Array(256);
            var d = 0;
            var b, l;

            while (s < src.length) {
                b = src[s++];
                if ((b === 0x00) || (b === 0x10) || (b === 0x20) || (b === 0x30)) {
                    dest[d++] = b;
                    s += 3;
                    continue;
                }
                l = 0;
                while (b === src[s + l]) l++;
                if (l > 1) {
                    dest[d++] = b | 0x80;
                    dest[d++] = l;
                    s += l;
                } else {
                    dest[d++] = b;
                }
            }

            return dest.slice(0, d);
        },
        decode: function(data) {
            var src = data;
            var s = 0; // source pointer
            var dest = new Uint8Array(256);
            var d = 0; // destination pointer
            var b, l;

            while (s < src.length) {
                b = src[s++];
                if (b & 0x80) {
                    l = src[s++] + 1;
                    b &= 0x7F;
                    while (l--) dest[d++] = b;
                } else if ((b === 0x00) || (b === 0x10) || (b === 0x20) || (b === 0x30)) {
                    dest[d++] = b;
                    dest[d++] = (b >> 4) * 3 + 0x70;
                    dest[d++] = (b >> 4) * 3 + 0x71;
                    dest[d++] = (b >> 4) * 3 + 0x72;
                } else {
                    dest[d++] = b;
                }
            }
            return dest.slice(0, d);
        }
    },
    "ff4-map": {
        encode: function(data) {
            var src = data;
            var s = 0; // source pointer
            var dest = new Uint8Array(1024);
            var d = 0;
            var b, l;

            while (s < src.length) {
                b = src[s];
                l = 1;
                while (b === src[s + l]) l++;
                if (l > 2) {
                    l = Math.min(l, 255);
                    dest[d++] = b | 0x80;
                    dest[d++] = l - 1;
                    s += l;
                } else {
                    dest[d++] = b;
                    s++;
                }
            }
            return dest.slice(0, d);
        },
        decode: function(data) {
            var src = data;
            var s = 0; // source pointer
            var dest = new Uint8Array(1024);
            var d = 0; // destination pointer
            var b, l;

            while (s < src.length) {
                b = src[s++];
                if (b & 0x80) {
                    l = src[s++] + 1;
                    b &= 0x7F;
                    while (l--) dest[d++] = b;
                } else {
                    dest[d++] = b;
                }
            }
            return dest.slice(0, d);
        }
    },
    "ff5-world": {
        encode: function(data) {
            var src = data;
            var s = 0; // source pointer
            var dest = new Uint8Array(256);
            var d = 0;
            var b, l;

            while (s < 256) {
                b = src[s++];
                if ((b === 0x0C) || (b === 0x1C) || (b === 0x2C)) {
                    dest[d++] = b;
                    s += 2;
                    continue;
                }
                l = 1;
                while (b === src[s + l]) l++;
                if (l > 2) {
                    l = Math.min(l, 32);
                    dest[d++] = 0xBF + l;
                    dest[d++] = b;
                    s += l - 1;
                } else {
                    dest[d++] = b;
                }
            }

            return dest.slice(0, d);
        },
        decode: function(data) {
            var src = data;
            var s = 0; // source pointer
            var dest = new Uint8Array(256);
            var d = 0; // destination pointer
            var b, l;

            while (s < src.length) {
                b = src[s++];
                if (b > 0xBF) {
                    l = b - 0xBF;
                    b = src[s++];
                    while (l--) dest[d++] = b;
                } else if ((b === 0x0C) || (b === 0x1C) || (b === 0x2C)) {
                    dest[d++] = b;
                    dest[d++] = b + 1;
                    dest[d++] = b + 2;
                } else {
                    dest[d++] = b;
                }
            }
            return dest;
        }
    },
    "ff5-lzss": {
        encode: function(data) {

            // create a source buffer preceded by 2K of empty space (this increases compression for some data)
            var src = new Uint8Array(0x0800 + data.length);
            src.set(data, 0x0800);
            var s = 0x0800; // start at 0x0800 to ignore the 2K of empty space

            var dest = new Uint8Array(0x10000);
            var d = 2; // start at 2 so we can fill in the length at the end

            var header = 0;
            var line = new Uint8Array(17);

            var l = 1; // start at 1 so we can fill in the header at the end
            var b = 0x07DE; // buffer position
            var p = 0;
            var pMax, len, lenMax;

            var w;
            var mask = 1;

            while (s < src.length) {
                // find the longest sequence that matches the decompression buffer
                lenMax = 0;
                pMax = 0;
                for (p = 1; p <= 0x0800; p++) {
                    len = 0;

                    while ((len < 34) && (s + len < src.length) && (src[s + len - p] == src[s + len]))
                        len++;

                    if (len > lenMax) {
                        // this sequence is longer than any others that have been found so far
                        lenMax = len;
                        pMax = (b - p) & 0x07FF;
                    }
                }

                // check if the longest sequence is compressible
                if (lenMax >= 3) {
                    // sequence is compressible - add compressed data to line buffer
                    w = pMax & 0xFF;
                    w |= (pMax & 0x0700) << 5;
                    w |= (lenMax - 3) << 8;
                    line[l++] = w & 0xFF;
                    w >>= 8;
                    line[l++] = w & 0xFF;
                    s += lenMax;
                    b += lenMax;
                } else {
                    // sequence is not compressible - update header byte and add byte to line buffer
                    header |= mask;
                    line[l++] = src[s];
                    s++;
                    b++;
                }

                b &= 0x07FF;
                mask <<= 1;

                if (mask == 0x0100) {
                    // finished a line, copy it to the destination
                    line[0] = header;

                    dest.set(line.subarray(0, l), d);
                    d += l;
                    header = 0;
                    l = 1;
                    mask = 1;
                }
            }

            if (mask != 1) {
                // we're done with all the data but we're still in the middle of a line
                line[0] = header;
                dest.set(line.subarray(0, l), d);
                d += l;
            }

            // fill in the length
            dest[0] = data.length & 0xFF;
            dest[1] = (data.length >> 8) & 0xFF;

            return dest.slice(0, d);
        },
        decode: function(data) {
            var src = data;
            var s = 0; // source pointer
            var dest = new Uint8Array(0x10000);
            var d = 0; // destination pointer
            var buffer = new Uint8Array(0x0800);
            var b = 0x07DE;
            var line = new Uint8Array(34);
            var header, pass, r, w, c, i, l;

            var length = src[s++] | (src[s++] << 8);
            while (d < length) { // ff5

                // read header
                header = src[s++];

                for (pass = 0; pass < 8; pass++, header >>= 1) {
                    l = 0;
                    if (header & 1) {
                        // single byte (uncompressed)
                        c = src[s++];
                        line[l++] = c;
                        buffer[b++] = c;
                        b &= 0x07FF;
                    } else {
                        // 2-bytes (compressed)
                        w = src[s++];
                        r = src[s++];
                        w |= (r & 0xE0) << 3;
                        r = (r & 0x1F) + 3;

                        for (i = 0; i < r; i++) {
                            c = buffer[(w + i) & 0x07FF];
                            line[l++] = c;
                            buffer[b++] = c;
                            b &= 0x07FF;
                        }
                    }
                    if ((d + l) > dest.length) {
                        // maximum buffer length exceeded
                        dest.set(line.subarray(0, dest.length - d), d)
                        return dest;
                    } else {
                        // copy this pass to the destination buffer
                        dest.set(line.subarray(0, l), d)
                        d += l;
                    }

                    // reached end of compressed data
                    if (d >= length) break; // ff5
                }
            }

            return dest.slice(0, d);
        }
    },
    "ff6-lzss": {
        encode: function(data) {
    
            // create a source buffer preceded by 2K of empty space (this increases compression for some data)
            var src = new Uint8Array(0x0800 + data.length);
            src.set(data, 0x0800);
            var s = 0x0800; // start at 0x0800 to ignore the 2K of empty space

            var dest = new Uint8Array(0x10000);
            var d = 2; // start at 2 so we can fill in the length at the end

            var header = 0;
            var line = new Uint8Array(17);

            var l = 1; // start at 1 so we can fill in the header at the end
            var b = 0x07DE; // buffer position
            var p = 0;
            var pMax, len, lenMax;

            var w;
            var mask = 1;

            while (s < src.length) {
                // find the longest sequence that matches the decompression buffer
                lenMax = 0;
                pMax = 0;
                for (p = 1; p <= 0x0800; p++) {
                    len = 0;

                    while ((len < 34) && (s + len < src.length) && (src[s + len - p] == src[s + len]))
                        len++;

                    if (len > lenMax) {
                        // this sequence is longer than any others that have been found so far
                        lenMax = len;
                        pMax = (b - p) & 0x07FF;
                    }
                }

                // check if the longest sequence is compressible
                if (lenMax >= 3) {
                    // sequence is compressible - add compressed data to line buffer
                    w = ((lenMax - 3) << 11) | pMax;
                    line[l++] = w & 0xFF;
                    w >>= 8;
                    line[l++] = w & 0xFF;
                    s += lenMax;
                    b += lenMax;
                } else {
                    // sequence is not compressible - update header byte and add byte to line buffer
                    header |= mask;
                    line[l++] = src[s];
                    s++;
                    b++;
                }

                b &= 0x07FF;
                mask <<= 1;

                if (mask == 0x0100) {
                    // finished a line, copy it to the destination
                    line[0] = header;

                    dest.set(line.subarray(0, l), d);
                    d += l;
                    header = 0;
                    l = 1;
                    mask = 1;
                }
            }

            if (mask != 1) {
                // we're done with all the data but we're still in the middle of a line
                line[0] = header;
                dest.set(line.subarray(0, l), d);
                d += l;
            }

            // fill in the length
            dest[0] = d & 0xFF;
            dest[1] = (d >> 8) & 0xFF;

            return dest.slice(0, d);
        },
        decode: function(data) {
            var src = data;
            var s = 0; // source pointer
            var dest = new Uint8Array(0x10000);
            var d = 0; // destination pointer
            var buffer = new Uint8Array(0x0800);
            var b = 0x07DE;
            var line = new Uint8Array(34);
            var header, pass, r, w, c, i, l;

            var length = src[s++] | (src[s++] << 8);
            while (s < length) {

                // read header
                header = src[s++];

                for (pass = 0; pass < 8; pass++, header >>= 1) {
                    l = 0;
                    if (header & 1) {
                        // single byte (uncompressed)
                        c = src[s++];
                        line[l++] = c;
                        buffer[b++] = c;
                        b &= 0x07FF;
                    } else {
                        // 2-bytes (compressed)
                        w = src[s++];
                        w |= (src[s++] << 8);
                        r = (w >> 11) + 3;
                        w &= 0x07FF;

                        for (i = 0; i < r; i++) {
                            c = buffer[(w + i) & 0x07FF];
                            line[l++] = c;
                            buffer[b++] = c;
                            b &= 0x07FF;
                        }
                    }
                    if ((d + l) > dest.length) {
                        // maximum buffer length exceeded
                        dest.set(line.subarray(0, dest.length - d), d)
                        return dest;
                    } else {
                        // copy this pass to the destination buffer
                        dest.set(line.subarray(0, l), d)
                        d += l;
                    }

                    // reached end of compressed data
                    if (s >= length) break;
                }
            }

            return dest.slice(0, d);
        }
    }
};

ROM.prototype.parseLink = function(link) {
    var components = link.split(".");
    var object = this;
    for (var c = 0; c < components.length; c++) {
        
        var key = components[c];
        var i = null;

        // check for an array subscript
        var subStart = key.indexOf('[');
        var subEnd = key.indexOf(']');
        if (subStart !== -1 && subEnd > subStart) {
            var sub = key.substring(subStart + 1, subEnd);
            var i = Number(sub);
            if (!isNumber(i)) {
                try {
                    i = eval(sub);
                } catch (e) {
                    this.log("Invalid Link: " + link);
                    return "Invalid Link: " + link;
                }
            }
            key = key.substring(0, subStart);
        }
        
        if (object && object[key] !== undefined) {
            object = object[key];
            if (!isNumber(i)) continue;
            
            if (object instanceof ROMArray) {
                // array entry
                object = object.item(i);
                continue;
            } else if (object instanceof ROMStringTable) {
                // string table entry
                object = object.formattedString(i);
                continue;
            }
        } else {
            this.log("Invalid Link: " + link);
            return "Invalid Link: " + link;
        }
    }
    return object;
}

ROM.prototype.showProperties = function(object) {
    
    var properties = document.getElementById("properties");
    
    if (!object) {
        // show properties for all objects
        properties.innerHTML = "";
        var rom = this;
        this.selection.forEach(function(object) {
            rom.showProperties(object);
        });
        this.updateLabels();
        return;
    }

    // show object name
    if (object.name) {
        var heading = document.createElement('p');
        properties.appendChild(heading);
        heading.classList.add("property-heading");
        heading.innerHTML = object.name.replace("%i", object.i);
    }

    if (object.appendHTML) {
        object.appendHTML(properties);
        return;
    }
    
    // return if object has no properties
    if (!object.assembly) return;
    var keys = Object.keys(object.assembly);
    if (!keys) return;
    
    // show properties
    for (var i = 0; i < keys.length; i++) {
        var key = keys[i];
        if (!object[key].appendHTML) continue;
        object[key].appendHTML(properties);
    }
}

ROM.prototype.updateLabels = function() {
    var labels = document.getElementsByClassName("property-label");
    var w = 0;
    var l;
    // find the widest label
    for (l = 0; l < labels.length; l++) {
        w = Math.max(w, labels[l].clientWidth);
    }
    // make all labels the same width
    for (l = 0; l < labels.length; l++) {
        labels[l].style.width = w + "px";
    }
}

ROM.prototype.select = function(object) {
    
    // deselect everything
    this.deselectAll();
    
    // if the object is a string, try to parse it as an object
    if (isString(object)) {
        object = this.parseLink(object);
        // return if it's an invalid link
        if (isString(object)) return;
    }
    
    if (object instanceof ROMScript) {
        scriptList.selectScript(object);
        return;
    } else if (object) {
        // select and observe the object, and show its properties
        this.selection.push(object);
        this.observer.startObserving(object, this.showProperties);
        
        if (object.key === "mapProperties") {
            map.loadMap(object.i);
            selectMap(object.i);
        }
    }
        
    this.showProperties();
}

ROM.prototype.deselect = function(object) {
    // return if the object is not selected
    var index = this.selection.indexOf(object);
    if (index === -1) return;
    
    // stop observing the object and deselect it
    this.observer.stopObserving(object);
    this.selection.splice(index, 1);
}

ROM.prototype.deselectAll = function() {
    var rom = this;
    this.selection.forEach(function(object) {
        rom.deselect(object);
    });
}

ROM.prototype.undoStack = [];
ROM.prototype.redoStack = [];
ROM.prototype.action = null;
ROM.prototype.canUndo = function() { return this.undoStack.length > 0; }
ROM.prototype.canRedo = function() { return this.redoStack.length > 0; }

ROM.prototype.undo = function() {
    if (!this.canUndo()) return;
    
    var action = this.undoStack.pop()
    this.doAction(action, true);
}

ROM.prototype.redo = function() {
    if (!this.canRedo()) return;
    
    var action = this.redoStack.pop()
    this.doAction(action, false);
}

ROM.prototype.doAction = function(action, undo) {
    
    if (undo === undefined) this.redoStack = [];
    
    this.pushAction(action, undo);
    if (action instanceof ROMAction) {
        action.execute(undo);
    } else if (isArray(action)) {
        for (var i = 0; i < action.length; i++) {
            var a = action[undo ? action.length - i - 1 : i];
            a.execute(undo);
        }
    }
}

ROM.prototype.pushAction = function(action, undo) {
    
    if (this.action && action instanceof ROMAction) {
        this.action.push(action);
        
    } else {
        // single action
        if (undo) {
            this.redoStack.push(action);
        } else {
            this.undoStack.push(action);
        }
    }
}

ROM.prototype.beginAction = function() {
    if (!this.action) this.action = [];
}

ROM.prototype.endAction = function() {
    if (this.action) this.undoStack.push(this.action);
//    this.redoStack = [];
    this.action = null;
}

// ROMAction
function ROMAction(object, undo, redo, description) {
    this.object = object;
    this.undo = undo;
    this.redo = redo;
    this.description = description;
}

ROMAction.prototype.execute = function(undo) {
    if (undo && this.undo) {
//        if (this.description) console.log(this.description);
        this.undo.call(this.object);
    } else if (!undo && this.redo) {
//        if (this.description) console.log(this.description);
        this.redo.call(this.object);
    }
}

// ROMObserver
function ROMObserver(rom, owner, options) {
    this.rom = rom;
    this.owner = owner;
    this.options = options || {};
    this.observees = [];
}

ROMObserver.prototype.startObserving = function(object, callback, args) {

    // can't observe nothing
    if (!object) return;

    // start observing the object and add it to the array of observees
    if (this.observees.indexOf(object) === -1) this.observees.push(object);
    if (object.addObserver) object.addObserver(this.owner, callback, args);
    
    if (this.options.sub) this.startObservingSub(object, callback, args);
    if (this.options.link) this.startObservingLink(object, callback, args);
    if (this.options.array) this.startObservingArray(object, callback, args);
}

ROMObserver.prototype.startObservingSub = function(object, callback, args) {
    // don't observe array prototypes
    if (object.array || !object.assembly) return;
    
    var keys = Object.keys(object.assembly);
    for (var i = 0; i < keys.length; i++) {
        var sub = object[keys[i]];
        this.startObserving(sub, callback, args);
    }
}

ROMObserver.prototype.startObservingLink = function(object, callback, args) {
    if (!object.link) return;
    var link = object.link.replace(/%i/g, object.value.toString());
    link = this.rom.parseLink(link);
    this.startObserving(link, callback, args);
}

ROMObserver.prototype.startObservingArray = function(object, callback, args) {
    if (!object.array) return;
    
    for (var i = 0; i < object.array.length; i++) {
        this.startObserving(object.array[i], callback, args);
    }
}

ROMObserver.prototype.stopObserving = function(object) {

    // can't observe nothing
    if (!object) return;

    // stop observing the object and remove it from the array of observees
    var index = this.observees.indexOf(object);
    if (index !== -1) this.observees.splice(index, 1);
    if (object.removeObserver) object.removeObserver(this.owner);

    if (this.options.sub) this.stopObservingSub(object);
    if (this.options.link) this.stopObservingLink(object);
    if (this.options.array) this.stopObservingArray(object);
}

ROMObserver.prototype.stopObservingSub = function(object) {
    // don't observe array prototype assemblies
    if (object.array || !object.assembly) return;
    
    var keys = Object.keys(object.assembly);
    for (var i = 0; i < keys.length; i++) {
        var sub = object[keys[i]];
        this.stopObserving(sub);
    }
}

ROMObserver.prototype.stopObservingLink = function(object) {
    if (!object.link) return;
    var link = object.link.replace(/%i/g, object.value.toString());
    link = this.rom.parseLink(link);
    this.stopObserving(link);
}

ROMObserver.prototype.stopObservingArray = function(object) {
    if (!object.array) return;
    
    for (var i = 0; i < object.array.length; i++) {
        this.stopObserving(object.array[i]);
    }
}

ROMObserver.prototype.stopObservingAll = function() {
    while (this.observees.length) this.stopObserving(this.observees[0]);
}

// ROMProperty
function ROMProperty(rom, definition, parent) {
    ROMAssembly.call(this, rom, definition, parent);
    
    this.mask = Number(definition.mask);
    if (!isNumber(this.mask)) { this.mask = 0xFF; }
    
    this.offset = Number(definition.offset);
    if (!isNumber(this.offset)) { this.offset = 0; }

    this.multiplier = Number(definition.multiplier);
    if (!isNumber(this.multiplier)) { this.multiplier = 1; }
    
    this.bool = (definition.bool === true);
    this.flag = (definition.flag === true);
    this.signed = (definition.signed === true);
    this.script = definition.script;
    this.link = definition.link;
    this.external = definition.external;
    
    this.special = {};
    var special = definition.special || {};
    var specialKeys = Object.keys(special);
    for (var i = 0; i < specialKeys.length; i++) {
        var key = specialKeys[i];
        var index = Number(key);
        if (!isNumber(index)) continue;
        this.special[index] = special[key];
    }

    // get the bit index
    for (var i = 0; ; i++) {
        if (((1 << i) & this.mask) == 0) continue;
        this.bit = i;
        break;
    }
    
    if (!this.signed) {
        this.min = definition.min || 0;
        this.max = definition.max || this.mask >> this.bit;
    } else if (this.mask === 0xFF) {
        this.min = definition.min || -128;
        this.max = definition.max || 127;
    } else if (this.mask === 0xFFFF) {
        this.min = definition.min || -32768;
        this.max = definition.max || 32767;
    }
    
    var length = 1;
    var mask = this.mask;
    while (mask & (~0 ^ 0xFF)) {
        mask >>= 8;
        length += 1;
    }
    
    this.value = this.min;
    
    // set the range
    this.range.end = this.range.begin + length;
}

ROMProperty.prototype = Object.create(ROMAssembly.prototype);
ROMProperty.prototype.constructor = ROMProperty;

Object.defineProperty(ROMProperty.prototype, "definition", { get: function() {
    var definition = Object.getOwnPropertyDescriptor(ROMAssembly.prototype, "definition").get.call(this);

    if (definition.range) {
        definition.begin = this.range.begin;
        delete definition.range;
    }
    
    if (this.mask !== 0xFF) definition.mask = hexString(this.mask, this.range.length * 2);
    if (this.offset !== 0) definition.offset = this.offset;
    if (this.multiplier !== 1) definition.multiplier = this.multiplier;
    if (this.bool) definition.bool = true;
    if (this.flag) definition.flag = true;
    if (this.signed) definition.signed = true;
    if (this.script) definition.script = this.script;
    if (this.link) definition.link = this.link;
    if (this.external) definition.external = this.external;
    if (Object.keys(this.special).length != 0) definition.special = this.special;
    if (this.min !== 0) definition.min = this.min;
    if (this.max !== (this.mask >> this.bit)) definition.max = this.max;
        
    return definition;
}});

ROMProperty.prototype.assemble = function(data) {
    
    if (data && this.external) {
        var external = this.rom.parseLink(this.external.replace("%i", this.parent.i));
        data = external.data;
    }

    // modify the value if needed
    var value = this.value;
    if (this.bool) value = value ? 1 : 0;
    value = Math.floor(value / this.multiplier);
    value -= this.offset;
    if (this.signed) {
        if (this.mask === 0xFF && value < 0) {
            value = 0x100 + value;
        } else if (this.mask == 0xFFFF && this.value < 0) {
            value = 0x10000 + value;
        }
    }
    value = (value << this.bit) & this.mask;
    
    // disassemble to get any adjacent data
    if (data) ROMAssembly.prototype.disassemble.call(this, data);
    
    var mask = (~this.mask) >>> 0;
    for (var i = 0; i < this.data.length; i++) {
        this.data[i] &= (mask & 0xFF);
        this.data[i] |= (value & 0xFF);
        mask >>= 8;
        value >>= 8;
    }

    ROMAssembly.prototype.assemble.call(this, data);
}

ROMProperty.prototype.disassemble = function(data) {
    
    if (this.external) {
        var external = this.rom.parseLink(this.external.replace("%i", this.parent.i));
        data = external.data;
    }

    ROMAssembly.prototype.disassemble.call(this, data);

    this.value = 0;
    for (var i = this.data.length - 1; i >= 0; i--) {
        this.value <<= 8;
        this.value |= this.data[i];
    }
    this.value &= this.mask;
    this.value >>= this.bit;
    if (this.bool) {
        this.value = (this.value === 1);
        return;
    } else if (this.signed) {
        if (this.mask == 0xFF && this.value > 0x7F) {
            this.value = this.value - 0x100;
        } else if (this.mask == 0xFFFF && this.value > 0x7FFF) {
            this.value = this.value - 0x10000;
        }
    }
    this.value += this.offset;
    this.value *= this.multiplier;
}

ROMProperty.prototype.markAsDirty = function() {
    
    if (this.external) {
        var external = this.rom.parseLink(this.external.replace("%i", this.parent.i));
        external.markAsDirty();
    }

    ROMAssembly.prototype.markAsDirty.call(this);
}

ROMProperty.prototype.setValue = function(value) {

    // limit the value based on min and max
//    if (!this.special[value]) {
//        value = Math.max(value, (this.min + this.offset) * this.multiplier);
//        value = Math.min(value, (this.max + this.offset) * this.multiplier);
//    }
    
    // return if the value didn't change
    var oldValue = this.value;
    if (value === oldValue) {
        this.notifyObservers();
        return;
    }

    // functions to undo/redo
    var assembly = this;
    function fixReferences(oldRef, newRef) {
        var script = assembly.rom[assembly.script];
        var oldCommand = script.ref[oldRef];
        // remove the old reference
        for (var r = 0; r < oldCommand.reference.length; r++) {
            var reference = oldCommand.reference[r];
            if (reference.target !== assembly) continue;
            oldCommand.reference.splice(r, 1);
        }
        
        // add a reference to the new command
        script.addPlaceholder(assembly, newRef);
    }
    function updateExternal() {
        var external = assembly.rom.parseLink(assembly.external.replace("%i", assembly.parent.i));
        assembly.assemble(external.data);
        external.notifyObservers();
    }
    function redo() {
        assembly.value = value;
        assembly.notifyObservers();
        if (assembly.script) fixReferences(oldValue, value);
        if (assembly.external) updateExternal();
    }
    function undo() {
        assembly.value = oldValue;
        assembly.notifyObservers();
        if (assembly.script) fixReferences(value, oldValue);
        if (assembly.external) updateExternal();
    }
        
    // perform an action to change the value
    var description = "Set " + this.name;
    var action = new ROMAction(this, undo, redo, description);
    this.rom.doAction(action);
}

ROMProperty.prototype.appendHTML = function(parent) {
    
    if (this.hidden || this.invalid) return null;
    var property = this;
    
    // create a div for the property
    var propertyDiv = document.createElement('div');
    propertyDiv.classList.add("property-div");
    var id = "property-" + this.key;
    
    // create a label
    var label;
    if (this.link) {
        // create a label with a link
        var link = this.link;
        label = document.createElement('a');
        link = link.replace("%i", this.value);
        label.href = "javascript:rom.select(\"" + link + "\");";
    } else if (this.script) {
        // create a label with a script link
        var script = this.rom[this.script];
        var command = script.ref[this.value];
        label = document.createElement('a');
        label.href = "javascript:rom.select(\"" + this.script + "\"); scriptList.selectRef(" + command.ref + ");";
    } else {
        // create a normal label
        label = document.createElement('label');
        label.htmlFor = id;
    }
    label.classList.add("property-label");
    label.innerHTML = this.name + ":";
    propertyDiv.appendChild(label);

    // create a div for the control(s)
    var controlDiv = document.createElement('div');
    propertyDiv.appendChild(controlDiv);
    controlDiv.classList.add("property-control-div");
    
    if (this.bool) {
        // property with a single boolean checkbox
        var input = document.createElement('input');
        controlDiv.appendChild(input);
        input.id = id;
        input.type = "checkbox";
        input.checked = this.value;
        input.disabled = this.disabled;
        input.classList.add("property-check");
        input.onchange = function() {
            var value = this.checked;
            property.setValue(value);
            document.getElementById(this.id).focus();
        };
        
    } else if (this.flag) {
        // property with boolean flags
        var flagChecks = [];
        for (var i = 0, mask = 1; mask < (this.mask >> this.bit); i++, mask <<= 1) {
            
            // create the check box
            var check = document.createElement('input');
            check.classList.add("property-check");
            check.value = mask;
            check.type = "checkbox";
            check.checked = this.value & mask;
            check.disabled = this.disabled;
            check.id = id + "-" + i;
            check.onchange = function() {
                var value = property.value;
                if (this.checked) {
                    // set bit
                    value |= this.value;
                } else {
                    // clear bit
                    value &= ~this.value;
                }
                property.setValue(value);
                document.getElementById(this.id).focus();
            }

            // create a label for the check box
            var label = document.createElement('label');
            label.classList.add("property-check-label");
            label.htmlFor = check.id;
            if (this.stringTable) {
                var stringTable = rom.stringTable[this.stringTable];
                if (!stringTable.string[i]) continue;
                label.innerHTML += stringTable.formattedString(i);
            } else {
                label.innerHTML = i;
            }
                        
            // create a div to hold the label and control
            var flagDiv = document.createElement('div');
            flagDiv.classList.add("property-check-div");
            flagDiv.appendChild(check);
            flagDiv.appendChild(label);
            flagChecks.push(check);
            controlDiv.appendChild(flagDiv);
        }
        
        // add check boxes for special values
        var specialValues = Object.keys(this.special);
        for (var i = 0; i < specialValues.length; i++) {
            var special = document.createElement('input');
            special.classList.add("property-check");
            special.id = id + "-special" + i;
            special.disabled = this.disabled;
            special.type = "checkbox";
            special.checked = false;

            var key = specialValues[i];
            var value = Number(key);
            special.value = value;
            if (Number(this.value) === value) {
                flagChecks.forEach(function(div) {
                    div.disabled = true;
                });
                special.checked = true;
            }
            special.onchange = function() {
                if (this.checked) {
                    property.setValue(this.value);
                } else {
                    property.setValue(property.min);
                }
                document.getElementById(this.id).focus();
            };

            // create a label for the check box
            var label = document.createElement('label');
            label.classList.add("property-check-label");
            label.htmlFor = special.id;
            label.innerHTML = this.special[key];

            // create a div to hold the label and control
            var specialDiv = document.createElement('div');
            specialDiv.classList.add("property-check-div");
            specialDiv.appendChild(special);
            specialDiv.appendChild(label);
            controlDiv.appendChild(specialDiv);
        }
        
    } else if (this.stringTable) {
        // property with a drop down list of strings
        var input = document.createElement('select');
        controlDiv.appendChild(input);
        input.id = id;
        input.disabled = this.disabled;
        input.classList.add("property-control");
        input.onchange = function() {
            var value = Number(input.value);
            property.setValue(value);
            document.getElementById(this.id).focus();
        };

        // create an option for each valid string in the table
        var stringTable = rom.stringTable[this.stringTable];
        var min = this.min + this.offset;
        var max = this.max + this.offset;
        for (var i = min; i <= max; i++) {
            
            var optionString = i.toString() + ": ";
            if (this.special[i]) {
                optionString += this.special[i];
            } else if (stringTable.string[i]) {
                optionString += stringTable.formattedString(i, 40);
            } else {
                continue;
            }
            
            var option = document.createElement('option');
            option.value = i;
            option.innerHTML = optionString;
            input.appendChild(option);
        }
        input.value = this.value;
        
    } else if (this.script) {
        // property linked to a script
        var script = this.rom[this.script];
        var command = script.ref[this.value];
        var input = document.createElement('input');
        controlDiv.appendChild(input);
        input.classList.add("property-control");
        input.id = id;
        input.disabled = this.disabled;
        input.type = "text";
        input.classList.add("property-control");
        input.value = command.label;
        input.onchange = function() {
            var command = script.label[this.value];
            if (!command) return;
            property.setValue(command.ref);
            document.getElementById(this.id).focus();
        };
        
    } else {
        // property with a number only
        var input = document.createElement('input');
        controlDiv.appendChild(input);
        input.id = id;
        input.disabled = this.disabled;
        input.type = "number";
        input.classList.add("property-control");
        input.value = this.value.toString();
        input.step = this.multiplier;
        input.min = (this.min + this.offset) * this.multiplier;
        input.max = (this.max + this.offset) * this.multiplier;
        input.onchange = function() {
            var value = Number(this.value);
            value = Math.max(value, input.min);
            value = Math.min(value, input.max);
            value -= value % input.step;
            property.setValue(value);
            document.getElementById(this.id).focus();
        };

        // add check boxes for special values
        var specialValues = Object.keys(this.special);
        for (var i = 0; i < specialValues.length; i++) {
            var specialDiv = document.createElement('div');
            specialDiv.classList.add("property-check-div");
            controlDiv.appendChild(specialDiv);
            var special = document.createElement('input');
            specialDiv.appendChild(special);
            special.classList.add("property-check");
            special.id = id + "-special" + i;
            special.disabled = this.disabled;
            special.type = "checkbox";
            special.checked = false;

            var key = specialValues[i];
            var value = (Number(key) + this.offset) * input.step;
            if (Number(this.value) === value) {
                input.disabled = true;
                special.checked = true;
            }
            special.onchange = function() {
                if (this.checked) {
                    property.setValue(value);
                } else {
                    property.setValue(property.min);
                }
                document.getElementById(this.id).focus();
            };

            // create a label for the check box
            var label = document.createElement('label');
            specialDiv.appendChild(label);
            label.classList.add("property-check-label");
            label.htmlFor = special.id;
            label.innerHTML = this.special[key];
        }
    }

    parent.appendChild(propertyDiv);
}

// ROMArray
function ROMArray(rom, definition, parent) {
    ROMAssembly.call(this, rom, definition, parent);

    // create the array
    this.array = [];
    if (definition.array) {
        var length = Number(definition.array.length);
        if (isNumber(length)) { this.array.length = length; }
        var max = Number(definition.array.max);
        if (isNumber(max)) { this.array.max = max; }
        var min = Number(definition.array.min);
        if (isNumber(min)) { this.array.min = min; }
    }
    
    // determine if elements are strictly sequential or shared
    this.isSequential = (definition.isSequential === true);
    this.autoBank = (definition.autoBank === true);
    this.terminator = definition.terminator;
    
    // create the prototype assembly
    if (!definition.assembly) { definition.assembly = { type: ROMObject.Type.assembly }; }
    if (!definition.assembly.type) { definition.assembly.type = ROMObject.Type.assembly; }
    definition.assembly.key = this.key;
    definition.assembly.name = this.name;
    this.assembly = ROMObject.create(this.rom, definition.assembly, this);
    this.assembly.parent = this;
    
    // create the pointer table
    if (definition.pointerTable) {
        definition.pointerTable.type = ROMObject.Type.pointerTable;
        definition.pointerTable.array = { length: this.array.length }
        this.pointerTable = ROMObject.create(rom, definition.pointerTable, parent);
        this.pointerTable.key = this.key + "PointerTable";
        this.pointerTable.name = "Pointers to " + this.name;
    }
}

ROMArray.prototype = Object.create(ROMAssembly.prototype);
ROMArray.prototype.constructor = ROMArray;

Object.defineProperty(ROMArray.prototype, "definition", { get: function() {
    var definition = Object.getOwnPropertyDescriptor(ROMAssembly.prototype, "definition").get.call(this);
    
    definition.array = {};
    if (this.array.length) definition.array.length = this.array.length;
    if (this.array.max) definition.array.max = this.array.max;
    if (this.array.min) definition.array.min = this.array.min;
    if (definition.array === {}) delete definition.array;
    if (this.isSequential) definition.isSequential = true;
    if (this.autoBank) definition.autoBank = true;
    if (this.terminator !== undefined) definition.terminator = this.terminator;
    
    definition.assembly = this.assembly.definition;
    
    if (definition.assembly.type === ROMObject.Type.assembly) delete definition.assembly.type;
    delete definition.assembly.range;
    delete definition.assembly.key;
    delete definition.assembly.name;
    if (this.assembly.range && !this.assembly.range.isEmpty)
        definition.assembly.length = this.assembly.range.length;
    if (Object.keys(definition.assembly).length == 0)
        delete definition.assembly;
    
    if (this.pointerTable) {
        var pointerTableDefinition = this.pointerTable.definition;
        delete pointerTableDefinition.key;
        delete pointerTableDefinition.name;
        delete pointerTableDefinition.array;
        delete pointerTableDefinition.type;
        delete pointerTableDefinition.assembly;
        definition.pointerTable = pointerTableDefinition;
    }
    
    return definition;
}});

ROMArray.prototype.updateReferences = function() {

    // update references for array items
    for (var i = 0; i < this.array.length; i++) {
        var assembly = this.array[i];
        if (assembly.updateReferences) assembly.updateReferences();
    }
    
    ROMAssembly.prototype.updateReferences.call(this);
}

ROMArray.prototype.assemble = function(data) {

    var length = 0;
    var i, assembly, pointer;
    if (!this.pointerTable) {
        // fixed-length items
        for (i = 0; i < this.array.length; i++) {
            assembly = this.array[i];
            assembly.range.begin = length;
            length += assembly.assembledLength;
            assembly.range.end = length;
        }
        
    } else if (this.isSequential) {
        // sequential items
        for (i = 0; i < this.array.length; i++) {
            assembly = this.array[i];
            assembly.range.begin = length;
            this.pointerTable.item(i).value = length + this.range.begin;
            this.pointerTable.item(i).markAsDirty();
            length += assembly.assembledLength;
        }
        
    } else {
        // shared items
        var duplicates = {};
        var pointers = [];
        for (i = 0; i < this.array.length; i++) {
            assembly = this.array[i];
            assembly.assemble();
            var assemblyData = assembly.lazyData;
            
            pointer = -1;
            for (var p = 0; p < pointers.length; p++) {
                pointer = pointers[p];
                if (duplicates[pointer] && compareTypedArrays(duplicates[pointer], assemblyData)) break;
                pointer = -1;
            }
            
            if (pointer === -1) {
                pointer = length;
                duplicates[pointer] = assemblyData;
                pointers.push(pointer);
                length += assembly.assembledLength;
            }
            
            // for auto-bank arrays, don't allow duplicates to span multiple banks
            if (this.autoBank && (pointer >> 16 !== length >> 16)) {
                duplicates = {};
            }
            assembly.range.begin = pointer;
            this.pointerTable.item(i).value = pointer + this.range.begin;
            this.pointerTable.item(i).markAsDirty();
        }
    }
    
    // create an array and assemble each item
    this.data = new Uint8Array(length);
    for (i = 0; i < this.array.length; i++) {
        this.array[i].assemble(this.data);
    }
    
    if (this.pointerTable) {
        this.pointerTable.assemble(data);
    }
    
    ROMAssembly.prototype.assemble.call(this, data);
}

ROMArray.prototype.disassemble = function(data) {

    ROMAssembly.prototype.disassemble.call(this, data);
    
    // disassemble the pointer table
    if (this.pointerTable) {
        this.pointerTable.disassemble(data);
    }
    
    // determine the range of each item in the array
    var itemRanges = [];
    var begin, end;
    if (this.terminator === "\\0") {
        // array of null-terminated strings
        begin = 0;
        var textEncoding = rom.textEncoding[this.assembly.encoding];
        while (begin < this.data.length) {
            end = begin + textEncoding.textLength(this.data.subarray(begin));
            itemRanges.push(new ROMRange(begin, end));
            begin = end;
        }

    } else if (this.terminator !== undefined) {
        // null-terminated items
        begin = 0;
        end = 0;
        var i = 0;
        while (end < this.data.length) {
            while (this.data[end] !== this.terminator && end < this.data.length) end++;
            end++;
            itemRanges.push(new ROMRange(begin, end));
            begin = end;
        }
        
    } else if (!this.pointerTable) {
        // fixed-length items
        var length = this.assembly.range.length || 1;
        
        // validate the number of array items
        if (this.array.length === 0) {
            this.array.length = Math.floor(this.range.length / length);
        }
        
        for (var i = 0; i < this.array.length; i++) {
            begin = i * length;
            itemRanges.push(new ROMRange(begin, begin + length));
        }
        
    } else if (this.isSequential) {
        // sequential items
        for (i = 0; i < (this.array.length - 1); i++) {
            begin = rom.mapAddress(this.pointerTable.item(i).value) - rom.mapAddress(this.range.begin);
            end = rom.mapAddress(this.pointerTable.item(i + 1).value) - rom.mapAddress(this.range.begin);
            itemRanges.push(new ROMRange(begin, end));
        }
        begin = rom.mapAddress(this.pointerTable.item(this.array.length - 1).value) - rom.mapAddress(this.range.begin);
        end = this.range.length;
        itemRanges.push(new ROMRange(begin, end));
        
    } else {
        // shared items
        var sortedPointers = [];
        var bankOffset = 0;
        var pointer = 0;
        var previousPointer = 0;
        for (i = 0; i < this.array.length; i++) {
            pointer = this.pointerTable.item(i).value;
            sortedPointers[i] = rom.mapAddress(pointer);
            
            // go to the next bank for auto-bank pointers
            if (!this.autoBank || i === 0) continue;
            pointer += bankOffset;
            if (pointer < previousPointer) {
                bankOffset += 0x010000;
                pointer += 0x010000;
            }
            sortedPointers[i] = rom.mapAddress(pointer);
            this.pointerTable.item(i).value = pointer;
            previousPointer = pointer;
        }
        
        // sort pointers in reverse order
        sortedPointers.sort(function(a, b) { return b - a; });
        
        // create an array of ranges corresponding to each pointer
        var pointerRanges = {};
        end = this.data.length; // rom.mapAddress(this.range.end);
        for (i = 0; i < sortedPointers.length; i++) {
            begin = sortedPointers[i] - rom.mapAddress(this.range.begin);
            var pointer = rom.unmapAddress(sortedPointers[i]);
            if (pointerRanges[pointer] !== undefined) continue;
            pointerRanges[pointer] = new ROMRange(begin, end);
            end = begin;
        }
        
        // create an array of ranges for each item
        for (i = 0; i < this.array.length; i++) {
            begin = rom.mapAddress(this.pointerTable.item(i).value);
            itemRanges.push(pointerRanges[begin]);
        }
    }
    
    // create each array item
    var definition = this.assembly.definition;
    for (i = 0; i < itemRanges.length; i++) {
        definition.range = itemRanges[i].toString();
        var assembly = ROMObject.create(this.rom, definition, this);
        assembly.i = i;
        assembly.disassemble(this.data);
        this.array[i] = assembly;
    }
}

ROMArray.prototype.blankAssembly = function() {
    var assembly = ROMObject.create(this.rom, this.assembly.definition, this);
    var data = new Uint8Array(assembly.range.length);
    assembly.disassemble(data);
    return assembly;
}

ROMArray.prototype.insertAssembly = function(assembly, i) {
    if (this.array.max && this.array.length >= this.array.max) {
        // array is full
        this.notifyObservers();
        return null;
    }
    
    // validate the index
    if (!isNumber(i) || i > this.array.length) {
        i = this.array.length;
    }
    
    // perform an action to insert the assembly
    var self = this;
    function redo() {
        self.array.splice(i, 0, assembly);
        self.notifyObservers();
    }
    function undo() {
        self.array.splice(i, 1);
        self.notifyObservers();
    }
    var description = "Insert Assembly";
    var action = new ROMAction(this, undo, redo, description);
    this.rom.doAction(action);
    return this.assembly[i];
}

ROMArray.prototype.removeAssembly = function(i) {
    // validate the index
    if (!isNumber(i) || i >= this.array.length) {
        this.notifyObservers();
        return null;
    }
    
    // perform an action to remove the assembly
    var self = this;
    var assembly = this.array[i];
    function redo() {
        self.array.splice(i, 1);
        self.notifyObservers();
    }
    function undo() {
        self.array.splice(i, 0, assembly);
        self.notifyObservers();
    }
    var description = "Remove Assembly";
    var action = new ROMAction(this, undo, redo, description);
    this.rom.doAction(action);
    return this.assembly[i];
}

ROMArray.prototype.item = function(i) {
    
    var assembly = this.array[i];
    if (!assembly) {
        // array index out of bounds
        return undefined;
    }
    
    if (!assembly.isLoaded) {
        // lazy load the array item
        assembly.disassemble(this.data);
    }
    return assembly;
}

// ROMPointerTable
function ROMPointerTable(rom, definition, parent) {
    ROMArray.call(this, rom, definition, parent);
    
    // bit mask for pointer data
    this.pointerLength = Number(definition.pointerLength);
    if (!isNumber(this.pointerLength)) this.pointerLength = this.rom.pointerLength;
    var mask = 0xFFFF;
    switch (this.pointerLength) {
        case 1: mask = 0xFF; break;
        case 2: mask = 0xFFFF; break;
        case 3: mask = 0xFFFFFF; break;
        case 4: mask = 0x7FFFFFFF; break;
    }

    // pointer offset
    var offset = Number(definition.offset);
    if (!isNumber(offset)) offset = 0;

    // define the pointer prototype
    this.assembly = ROMObject.create(this.rom, { type: ROMObject.Type.property, mask: mask, offset: offset });
}

ROMPointerTable.prototype = Object.create(ROMArray.prototype);
ROMPointerTable.prototype.constructor = ROMPointerTable;

Object.defineProperty(ROMPointerTable.prototype, "definition", { get: function() {
    var definition = Object.getOwnPropertyDescriptor(ROMArray.prototype, "definition").get.call(this);
    
    if (this.pointerLength != this.rom.pointerLength)
        definition.pointerLength = this.pointerLength;
    if (this.assembly.offset != 0) definition.offset = hexString(this.assembly.offset);
    
    return definition;
}});

// ROMCommand
function ROMCommand(rom, definition, parent) {
    this.encoding = definition.encoding;
    this.ref = definition.ref;
    this._label = definition.label;
    this.category = definition.category;

    ROMData.call(this, rom, definition, parent);

    // minimum length 1
    if (this.range.length === 0) this.range.end = this.range.begin + 1;
}

ROMCommand.prototype = Object.create(ROMData.prototype);
ROMCommand.prototype.constructor = ROMCommand;

ROMCommand.prototype.assemble = function(data) {
    var encoding = this.rom.scriptEncoding[this.encoding];
    encoding.willAssemble(this);
    
    ROMData.prototype.assemble.call(this, data);
}

ROMCommand.prototype.disassemble = function(data) {
    ROMData.prototype.disassemble.call(this, data);
    
    var encoding = this.rom.scriptEncoding[this.encoding];
    encoding.didDisassemble(this, data);
}

Object.defineProperty(ROMCommand.prototype, "label", { get: function() {
    // custom label
    if (this._label)
        return this._label;
    
    // default label
    var parent = this.parent;
    var address = this.range.begin;
    while (parent) {
        address += parent.range.begin;
        parent = parent.parent;
    }
    address = this.rom.unmapAddress(address);
    var bank = address >> 16;
    address &= 0xFFFF;
    bank = bank.toString(16).toUpperCase().padStart(2, '0');
    address = address.toString(16).toUpperCase().padStart(4, '0');
    return (bank + "/" + address);
}});

Object.defineProperty(ROMCommand.prototype, "description", { get: function() {
    return this.rom.scriptEncoding[this.encoding].description(this);
}});

// ROMScript
function ROMScript(rom, definition, parent) {
    ROMAssembly.call(this, rom, definition, parent);

    this.encoding = definition.encoding;
    this.command = []; // commands in sequential order
    this.ref = []; // commands by reference
    this.label = {}; // commands by label
    this.nextRef = 0;
    
    // create label placeholders
    if (definition.label) {
        var keys = Object.keys(definition.label);
        for (var i = 0; i < keys.length; i++) {
            var key = keys[i];
            var label = definition.label[key];
            var ref = rom.mapAddress(Number(key) - this.range.begin);
            if (isString(label)) label = {label: label};
            this.ref[ref] = label;
        }
    }
}

ROMScript.prototype = Object.create(ROMAssembly.prototype);
ROMScript.prototype.constructor = ROMScript;

Object.defineProperty(ROMScript.prototype, "definition", { get: function() {
    var definition = Object.getOwnPropertyDescriptor(ROMAssembly.prototype, "definition").get.call(this);
    
    definition.encoding = this.encoding;

    var keys = Object.keys(this.label);
    if (keys.length) {
        definition.label = {};
        for (var i = 0; i < keys.length; i++) {
            var key = keys[i];
            var command = this.label[key];
            var ref = rom.unmapAddress(command.range.begin) + this.range.begin;
            definition.label[key] = hexString(ref, 6);
        }
    }

    return definition;
}});

ROMScript.prototype.updateReferences = function() {

    // update references for commands
    this.ref = [];
    for (i = 0; i < this.command.length; i++) {
        var command = this.command[i];
        command.markAsDirty();
        command.updateReferences();
        command.ref = command.range.begin;
        this.ref[command.ref] = command;
    }
    
    ROMAssembly.prototype.updateReferences.call(this);
}

ROMScript.prototype.assemble = function(data) {

    for (var c = 0; c < this.command.length; c++) {
        this.command[c].assemble(this.data);
    }

    ROMAssembly.prototype.assemble.call(this, data);
}

ROMScript.prototype.disassemble = function(data) {

    ROMAssembly.prototype.disassemble.call(this, data);

    // start with default encoding
    var encoding = this.defaultEncoding;
    encoding.initScript(this);
    
    // disassemble commands
    var offset = 0;
    while (offset < this.data.length) {
        
        // get placeholder at this offset
        var ref = this.ref[offset];
        if (ref && ref.encoding) {
            if (ref.encoding && this.rom.scriptEncoding[ref.encoding]) {
                encoding = this.rom.scriptEncoding[ref.encoding];
            }
        }
        
        var opcode = this.data[offset];
        var definition = encoding.command[opcode];
        
        // try a 2-byte opcode
        if (!definition && (offset + 1 <= this.data.length)) {
            var opcode2 = (opcode << 8) | this.data[offset + 1];
            definition = encoding.command[opcode2];
        }
        
        // use the default command if the opcode is not defined
        if (!definition) definition = encoding.command.default;
        
        // set the command's offset, ref, and label
        definition.begin = offset.toString();
        definition.ref = offset;
        if (ref && ref.label) definition.label = ref.label;
        
        // create the new command and disassemble it
        var command = new ROMCommand(this.rom, definition, this);
        definition.begin = null;
        definition.ref = null;
        definition.label = null;
        command.disassemble(this.data);
        this.command.push(command);
        this.ref[offset] = command;
        
        // copy references from placeholders
        if (ref && ref.reference) {
            for (var r = 0; r < ref.reference.length; r++) {
                // skip references with no target, they are just used
                // to update the script encoding during disassembly
                if (!ref.reference[r].target) continue;
                ref.reference[r].parent = command;
                command.reference.push(ref.reference[r]);
            }
        }
        
        // get the encoding for the next command
        var nextEncoding = encoding.nextEncoding(command);
        if (encoding.key !== nextEncoding) encoding = this.rom.scriptEncoding[nextEncoding];
        
        // next command
        offset += command.assembledLength || 1;
    }
    this.nextRef = offset;
    
    this.label = {};
    this.updateOffsets();
}

ROMScript.prototype.blankCommand = function(identifier) {
    identifier = identifier || "default";
    var components = identifier.split('.');
    var encoding = this.defaultEncoding;
    if (components.length === 2) {
        encoding = this.rom.scriptEncoding[components[0]];
        identifier = components[1];
    }
    if (!encoding) return null;
    var definition = encoding.command[identifier];
    if (!definition) return null;
    var command = new ROMCommand(this.rom, definition, this);
    command.ref = this.nextRef++;
    var data = new Uint8Array(command.range.length);
    var opcode = encoding.opcode[identifier];
    data[0] = opcode & 0xFF;
    if (opcode > 0xFF && data.length > 1) data[1] = opcode >> 8;
    command.disassemble(data);
    return command;
}

ROMScript.prototype.insertCommand = function(command, ref) {
    
    // validate the ref to insert after
    var previousCommand = this.ref[ref];
    var i = this.command.indexOf(previousCommand);
    if (i === -1) i = this.command.length - 1;
    
    // perform an action to insert the assembly
    function redo() {
        this.command.splice(i, 0, command);
        if (!command.ref) command.ref = this.nextRef++;
        this.ref[command.ref] = command;
        this.notifyObservers();
    }
    function undo() {
        this.command.splice(i, 1);
        this.ref[command.ref] = null;
        this.notifyObservers();
    }
    var description = "Insert Command";
    var action = new ROMAction(this, undo, redo, description);
    this.rom.doAction(action);
    return this.command[i];
}

ROMScript.prototype.removeCommand = function(command) {
    
    // validate the command
    var i = this.command.indexOf(command);
    if (i === -1) {
        this.notifyObservers();
        return null;
    }
    
    // perform an action to remove the assembly
    function redo() {
        this.command.splice(i, 1);
        this.ref[command.ref] = null;
        this.notifyObservers();
    }
    function undo() {
        this.command.splice(i, 0, command);
        if (!command.ref) command.ref = this.nextRef++;
        this.ref[command.ref] = command;
        this.notifyObservers();
    }
    var description = "Remove Command";
    var action = new ROMAction(this, undo, redo, description);
    this.rom.doAction(action);
    return this.command[i];
}

ROMScript.prototype.addPlaceholder = function(target, offset, encoding, label) {
    var placeholder = this.ref[offset] || {};
    placeholder.reference = placeholder.reference || [];
    this.ref[offset] = placeholder;

    // add a reference
    var definition = {target: target, options: {
        address: true,
//        relative: this // i might need to make this adjustable
    }};
    var reference = new ROMReference(this.rom, definition, placeholder);
    placeholder.reference.push(reference);

    if (placeholder instanceof ROMCommand) return;
    
    // save the encoding and label in the placeholder
    placeholder.encoding = placeholder.encoding || encoding;
    placeholder.label = placeholder.label || label;
}

ROMScript.prototype.updateOffsets = function() {
    var offset = 0;
    this.label = [];
    for (var c = 0; c < this.command.length; c++) {
        var command = this.command[c];
        command.range.begin = offset;
        offset += command.assembledLength;
        command.range.end = offset;
        this.label[command.label] = command;
    }
}

Object.defineProperty(ROMScript.prototype, "defaultEncoding", { get: function() {
    var encodingName = isArray(this.encoding) ? this.encoding[0] : this.encoding;
    return this.rom.scriptEncoding[encodingName];
}});

// ROMScriptEncoding
function ROMScriptEncoding(rom, definition, parent) {
    ROMObject.call(this, rom, definition, parent);
    this.type = ROMObject.Type.scriptEncoding;

    if (definition.delegate) this.delegate = window[definition.delegate];

    // default opcode definition
    var opcodeDef = {
        "type": "property",
        "name": "Opcode",
        "begin": 0,
        "mask": "0xFF",
        "invalid": true
    }

    // create the command prototypes
    this.command = {};
    this.opcode = [];
    if (!definition.command) return;
    var keys = Object.keys(definition.command);
    for (var i = 0; i < keys.length; i++) {
        var key = keys[i];
        var command = definition.command[key];
        command.key = key;
        command.encoding = this.key;
        if (!command.assembly) command.assembly = {};
        if (!command.assembly.opcode) command.assembly.opcode = opcodeDef;

        // convert single opcodes to an array
        var opcode = command.opcode;
        if (!opcode) continue;
        if (!isArray(opcode)) opcode = [opcode];
        
        // change the mask for 2-byte opcodes
        if (opcode[0] > 0xFF) command.assembly.opcode.mask = "0xFFFF";
        
        // store the command definition by all of its opcodes
        for (var o = 0; o < opcode.length; o++) {
            var range = ROMRange.parse(opcode[o]);
            var n = Number(opcode[o]);
            if (!range.isEmpty) {
                if (o === 0) this.opcode[command.key] = range.begin;
                for (var r = range.begin; r < range.end; r++) {
                    this.command[r] = command;
                }
            } else if (isNumber(n)) {
                if (o === 0) this.opcode[command.key] = n;
                this.command[n] = command;
            } else if (opcode[o] === "default") {
                this.command.default = command;
            }
        }
        
        // store the command definition by key
        this.command[key] = command;
    }
    
    // default command
    if (!this.command.default) {
        this.command.default = {
            "key": "default",
            "name": "Default Command",
            "length": 1,
            "encoding": this.key,
            "assembly": {
                "opcode": opcodeDef
            }
        };
    }
}

ROMScriptEncoding.prototype = Object.create(ROMObject.prototype);
ROMScriptEncoding.prototype.constructor = ROMScriptEncoding;

Object.defineProperty(ROMScriptEncoding.prototype, "definition", { get: function() {
    var definition = Object.getOwnPropertyDescriptor(ROMObject.prototype, "definition").get.call(this);
    
    if (this.delegate) definition.delegate = this.delegate.name;

    return definition;
}});

ROMScriptEncoding.prototype.description = function(command) {
    if (this.delegate && this.delegate.description) {
        return this.delegate.description(command);
    } else {
        var opcode = command.opcode.value;
        return "Command " + hexString(opcode, 2);
    }
}

ROMScriptEncoding.prototype.initScript = function(script) {
    if (this.delegate && this.delegate.initScript) {
        return this.delegate.initScript(script);
    }
}

ROMScriptEncoding.prototype.didDisassemble = function(command, data) {
    if (this.delegate && this.delegate.didDisassemble) {
        return this.delegate.didDisassemble(command, data);
    }
}

ROMScriptEncoding.prototype.willAssemble = function(command) {
    if (this.delegate && this.delegate.willAssemble) {
        return this.delegate.willAssemble(command);
    }
}

ROMScriptEncoding.prototype.nextEncoding = function(command) {
    if (this.delegate && this.delegate.nextEncoding) {
        return this.delegate.nextEncoding(command);
    } else {
        return command.encoding;
    }
}

ROMScriptEncoding.prototype.populateMenu = function(menu) {
    menu.innerHTML = "";
    menu.classList.add('menu');
    
    var hierarchy = {};
    var names = []; // commands that have already been sorted
    
    function createSubMenu(menu, commands) {
        var keys = Object.keys(commands).sort();
        for (var i = 0; i < keys.length; i++) {
            var key = keys[i];
            var command = commands[key];
            var li = document.createElement('li');
            li.innerHTML = key;
            li.classList.add("menu-item");
            if (command.encoding) {
                // command
                li.id = command.encoding + "." + command.key;
                li.onclick = function() { eval('scriptList.insert("' + this.id + '")'); };
            } else {
                // category
                var ul = document.createElement('ul');
                ul.classList.add("menu-submenu");
                ul.classList.add("menu");
                createSubMenu(ul, command);
                li.appendChild(ul);
            }
            menu.appendChild(li);
        }
    }
    
    // go through all of the commands and pick out categories
    var keys = Object.keys(this.command);
    for (var i = 0; i < keys.length; i++) {
        var key = keys[i];
        var opcode = Number(key);
        if (!isNumber(opcode)) continue;
        var command = this.command[key];
        if (!command.name) continue;
        if (names.indexOf(command.name) !== -1) continue;
        names.push(command.name);
        
        if (command.category) {
            // create a category if needed
            if (!hierarchy[command.category]) hierarchy[command.category] = {};
            hierarchy[command.category][command.name] = command;
        } else {
            hierarchy[command.name] = command;
        }
    }
    
    createSubMenu(menu, hierarchy);
}

// ROMScriptList
function ROMScriptList(rom) {
    this.rom = rom;
    this.scriptList = document.getElementById("script-list");
    this.scriptList.innerHTML = "";
    this.container = this.scriptList.parentElement;
    this.script = null;
    this.selection = []; // selected commands
    this.node = []; // command nodes by ref
    
    this.blockSize = 50; // number of commands per block
    this.blockStart = 0; // starting location of first block
    this.numBlocks = 3; // number of blocks visible at one time
    this.rowHeight = 17;
    
    this.observer = new ROMObserver(rom, this, {sub: true});
    
    var self = this;
    this.scriptList.parentElement.onscroll = function() { self.scroll(); };
    this.menu = document.getElementById('menu');
    this.scriptList.parentElement.oncontextmenu = function(e) { self.openMenu(e); return false; };
    
    var insertButton = document.getElementById("script-insert");
    insertButton.onclick = function(e) { self.openMenu(e); };
}

ROMScriptList.prototype.scroll = function() {
    
    this.closeMenu();
    
    var topSpace = this.scriptList.firstChild;
    var bottomSpace = this.scriptList.lastChild;
    if (!topSpace || !bottomSpace) return;
    
    if (this.container.scrollTop < topSpace.offsetHeight) {
        // scrolled off the top
        var index = Math.floor(this.blockStart - (topSpace.offsetHeight - this.container.scrollTop) / this.rowHeight);
        
        // save the scroll position for the top command
        var topCommand = this.script.command[this.blockStart];
        var commandNode = this.node[topCommand.ref];
        var oldOffset, newOffset;
        if (commandNode) {
            oldOffset = commandNode.offsetTop;
        }
        
        // change blockStart so that the previous blocks are visible
        index = index - index % this.blockSize - this.blockSize * (this.numBlocks - 2);
        this.blockStart = Math.max(index, 0);
        this.update();
        
        // recalculate the scroll position so that the first command stays in the same spot
        commandNode = this.node[topCommand.ref];
        if (commandNode && oldOffset) {
            newOffset = commandNode.offsetTop;
            this.scriptList.parentElement.scrollTop += newOffset - oldOffset;
        }
        
    } else if ((this.container.scrollTop + this.container.offsetTop + this.container.offsetHeight) > bottomSpace.offsetTop) {
        // scrolled off the bottom
        var index = Math.floor(this.blockStart + (this.container.scrollTop + this.container.offsetTop + this.container.offsetHeight - bottomSpace.offsetTop) / this.rowHeight);
        
        // save the scroll position for the bottom command
        var bottomIndex = Math.min(this.blockStart + this.blockSize * this.numBlocks - 1, this.script.command.length - 1);
        var bottomCommand = this.script.command[bottomIndex];
        var commandNode = this.node[bottomCommand.ref];
        var oldOffset, newOffset;
        if (commandNode) {
            oldOffset = commandNode.offsetTop;
        }
        
        // change blockStart so that the next blocks are visible
        index = index - index % this.blockSize + this.blockSize * (this.numBlocks - 2);
        var maxStart = this.script.command.length - this.blockSize * this.numBlocks;
        maxStart = maxStart + this.blockSize - (maxStart % this.blockSize);
        this.blockStart = Math.min(index, maxStart);
        this.update();
        
        // recalculate the scroll position so that the first command stays in the same spot
        commandNode = this.node[bottomCommand.ref];
        if (commandNode && oldOffset) {
            newOffset = commandNode.offsetTop;
            this.scriptList.parentElement.scrollTop += newOffset - oldOffset;
        }
    }
}

ROMScriptList.prototype.selectScript = function(script) {
    document.getElementById("script").classList.remove("hidden");
    
    if (this.script === script) return;
    this.deselectAll();
    this.script = script;
    
    // populate the list
    this.blockStart = 0;
    this.update();
}

ROMScriptList.prototype.selectCommand = function(command) {
    
    this.closeMenu();

    // clear the old selection
    this.deselectAll();
    
    if (!command) {
        this.selection = [];
        return;
    }
    this.selection = [command];
    
    // select the command in the rom
    this.rom.select(command);
    
    var node = this.node[command.ref];
    if (!node) {
        // node is not in the current block
        var index = this.script.command.indexOf(command);
        this.blockStart = Math.max(index - index % this.blockSize - this.blockSize, 0);
        this.update();
        node = this.node[command.ref];
        this.scriptList.parentElement.scrollTop = node.offsetTop - this.container.offsetTop - Math.floor(this.container.offsetHeight - node.offsetHeight) / 2;
    }
    
    node.classList.add("selected");
}

ROMScriptList.prototype.selectRef = function(ref) {
    this.selectCommand(this.script.ref[ref]);
}

ROMScriptList.prototype.deselectAll = function() {
    for (var c = 0; c < this.selection.length; c++) {
        var command = this.selection[c];
        if (!command) continue;
        var node = this.node[command.ref];
        if (!node) continue;
        node.classList.remove("selected");
    }
    this.selection = [];
}

ROMScriptList.prototype.insert = function(identifier) {
    if (!this.script) return;
    
    this.closeMenu();
    
    var command = this.script.blankCommand(identifier);
    
    var firstCommand = this.selection[0];
    var lastCommand = this.selection[this.selection.length - 1];
    var end = this.script.command.indexOf(lastCommand);
//    if (end === this.script.command.length - 1) return;
    var nextCommand = this.script.command[end + 1];

    this.rom.beginAction();
    var self = this;
    this.rom.pushAction(new ROMAction(this, function() {
        this.script.updateOffsets();
        this.selectCommand(lastCommand);
        this.update();
    }, null, "Update Script"));
    this.script.insertCommand(command, nextCommand.ref);
    this.rom.doAction(new ROMAction(this, null, function() {
        this.script.updateOffsets();
        this.selectCommand(command);
        this.update();
    }, "Update Script"));
    this.rom.endAction();
}

ROMScriptList.prototype.delete = function() {
    // return if nothing is selected
    if (!this.script) return;
    if (this.selection.length === 0) return;
    this.closeMenu();
    
    var lastCommand = this.selection[this.selection.length - 1];
    var i = this.script.command.indexOf(lastCommand);
    var nextCommand = this.script.command[i + 1] || this.script.command[this.script.command.length - 2];

    this.rom.beginAction();
    var self = this;
    this.rom.pushAction(new ROMAction(this, function() {
        this.script.updateOffsets();
        this.selectCommand(lastCommand);
        this.update();
    }, null, "Update Script"));
    this.selection.forEach(function(command) {
        self.script.removeCommand(command);
    });
    this.rom.doAction(new ROMAction(this, null, function() {
        this.script.updateOffsets();
        this.selectCommand(nextCommand);
        this.update();
    }, "Update Script"));
    this.rom.endAction();
}

ROMScriptList.prototype.moveUp = function() {
    // return if nothing is selected
    if (!this.script) return;
    if (this.selection.length === 0) return;
    this.closeMenu();
    
    var firstCommand = this.selection[0];
    var start = this.script.command.indexOf(firstCommand);
    if (start === 0) return;
    var previousCommand = this.script.command[start - 1];
    var lastCommand = this.selection[this.selection.length - 1];
    var end = this.script.command.indexOf(lastCommand);
    if (end === this.script.command.length - 1) return;
    var nextCommand = this.script.command[end + 1];

    function updateScript() {
        this.script.updateOffsets();
        this.selectCommand(firstCommand);
        this.update();
    }

    this.rom.beginAction();
    var self = this;
    this.rom.pushAction(new ROMAction(this, updateScript, null, "Update Script"));
    this.script.removeCommand(previousCommand);
    this.script.insertCommand(previousCommand, nextCommand.ref);
    this.rom.doAction(new ROMAction(this, null, updateScript, "Update Script"));
    this.rom.endAction();
}

ROMScriptList.prototype.moveDown = function() {
    // return if nothing is selected
    if (!this.script) return;
    if (this.selection.length === 0) return;
    this.closeMenu();
    
    var firstCommand = this.selection[0];
    var start = this.script.command.indexOf(firstCommand);
    if (start === 0) return;
    var previousCommand = this.script.command[start - 1];
    var lastCommand = this.selection[this.selection.length - 1];
    var end = this.script.command.indexOf(lastCommand);
    if (end === this.script.command.length - 1) return;
    var nextCommand = this.script.command[end + 1];

    function updateScript() {
        this.script.updateOffsets();
        this.selectCommand(firstCommand);
        this.update();
    }

    this.rom.beginAction();
    var self = this;
    this.rom.pushAction(new ROMAction(this, updateScript, null, "Update Script"));
    this.script.removeCommand(nextCommand);
    this.script.insertCommand(nextCommand, firstCommand.ref);
    this.rom.doAction(new ROMAction(this, null, updateScript, "Update Script"));
    this.rom.endAction();
}

ROMScriptList.prototype.update = function() {
        
    if (!this.script) return;
    
    // recalculate top and bottom spacers
    
    // create a dummy li to determine the row height
    var dummy = document.createElement("li");
    dummy.innerHTML = "Dummy"
    this.scriptList.appendChild(dummy);
    this.rowHeight = dummy.scrollHeight;
    this.scriptList.removeChild(dummy);
    
    var totalHeight = this.script.command.length * this.rowHeight;
    var blockTop = this.blockStart * this.rowHeight;
    var blockBottom = blockTop + this.blockSize * this.numBlocks * this.rowHeight;
    
    // stop observing current nodes
    this.observer.stopObservingAll();
    
    // remove all nodes
    this.node = [];
    this.scriptList.innerHTML = "";
    
    // create top space
    var topSpace = document.createElement('div');
    topSpace.className = "script-spacer";
    this.scriptList.appendChild(topSpace);

    // create nodes
    for (var c = 0; c < this.blockSize * this.numBlocks; c++) {
        var command = this.script.command[c + this.blockStart];
        if (!command) break;
        var li = this.liForCommand(command);
        this.node[command.ref] = li;
        this.scriptList.appendChild(li);
    }

    // start observing new nodes
    var self = this;
    this.node.forEach(function(li) {
        var command = self.script.ref[li.value];
        if (!command) return;
        self.observer.startObserving(command, self.update);
    });

    // create bottom space
    var bottomSpace = document.createElement('div');
    bottomSpace.className = "script-spacer";
    this.scriptList.appendChild(bottomSpace);
    
    // set top space height
    topSpace.style.height = blockTop + "px";
    bottomSpace.style.height = Math.max(totalHeight - blockBottom, 0) + "px";
    
    // highlight selected commands
    for (var c = 0; c < this.selection.length; c++) {
        var command = this.selection[c];
        var node = this.node[command.ref];
        if (!node) continue;
        node.className = "selected";
    }
}

ROMScriptList.prototype.liForCommand = function(command) {
    var li = document.createElement("li");
    li.value = command.ref;
    var list = this;
    li.onclick = function() {
        list.selectRef(this.value);
    };
    var span = document.createElement("span");
    span.classList.add("script-offset");
    if (command._label) span.classList.add("bold");
    span.innerHTML = command.label;
    li.appendChild(span);
    var p = document.createElement('p');
    p.innerHTML = command.description;
    li.appendChild(p);
    return li;
}

ROMScriptList.prototype.updateMenu = function() {
    
    this.menu.innerHTML = "";
    
    // build the menu for the appropriate script commands
    if (isArray(this.script.encoding)) {
        for (var i = 0; i < this.script.encoding.length; i++) {
            var encodingName = this.script.encoding[i];
            var encoding = this.rom.scriptEncoding[encodingName];
            var subMenu = document.createElement("ul");
            subMenu.classList.add("menu-submenu");
            if (encoding) encoding.populateMenu(subMenu);
            var encodingLabel = document.createElement("li");
            encodingLabel.classList.add("menu-item");
            encodingLabel.innerHTML = encoding.name;
            encodingLabel.appendChild(subMenu);
            this.menu.appendChild(encodingLabel);
        }
    } else {
        var encoding = this.rom.scriptEncoding[this.script.encoding];
        if (encoding) encoding.populateMenu(this.menu);
    }
}

ROMScriptList.prototype.openMenu = function(e) {
    this.updateMenu();
    
    this.menu.classList.add("menu-active");
    this.menu.style.left = e.x + "px";
    this.menu.style.height = "";
    
    var top = e.y;
    var height = this.menu.clientHeight;
    if (height + top > window.innerHeight) {
        top = window.innerHeight - height;
    }
    if (top < 0) {
        this.menu.style.height = window.innerHeight + "px";
        top = 0;
    }
    this.menu.style.top = top + "px";
}

ROMScriptList.prototype.closeMenu = function() {
    this.menu.classList.remove("menu-active");
}

// ROMText
function ROMText(rom, definition, parent) {
    ROMAssembly.call(this, rom, definition, parent);
    
    this.encoding = definition.encoding;
    this.text = "";
    this.external = definition.external;
}

ROMText.prototype = Object.create(ROMAssembly.prototype);
ROMText.prototype.constructor = ROMText;

Object.defineProperty(ROMText.prototype, "definition", { get: function() {
    var definition = Object.getOwnPropertyDescriptor(ROMAssembly.prototype, "definition").get.call(this);

    delete definition.range;
    if (this.range.begin) definition.begin = this.range.begin;
    if (this.range.length) definition.length = this.range.length;
    definition.encoding = this.encoding;
    if (this.external) definition.external = this.external;

    return definition
}});

ROMText.prototype.assemble = function(data) {
    
    if (data && this.external) {
        var external = this.rom.parseLink(this.external.replace("%i", this.parent.i));
        data = external.data;
    }

    ROMAssembly.prototype.assemble.call(this, data);
}

ROMText.prototype.disassemble = function(data) {
    
    if (this.external) {
        var external = this.rom.parseLink(this.external.replace("%i", this.parent.i));
        data = external.data;
    }

    if (this.range.length === 0) this.range = new ROMRange(0, data.length);
    
    ROMAssembly.prototype.disassemble.call(this, data);
    
    var encoding = this.rom.textEncoding[this.encoding];
    if (encoding) {
        this.text = encoding.decode(this.data);
    } else {
        this.text = String.fromCharCode.apply(null, this.data);
    }
}

ROMText.prototype.appendHTML = function(parent) {
    
    if (this.hidden || this.invalid) return null;
    
    // create a div for the property
    var propertyDiv = document.createElement('div');
    propertyDiv.classList.add("property-div");
    var id = "property-" + this.key;
    
    // create a label
    var label = document.createElement('label');
    label.htmlFor = id;
    label.classList.add("property-label");
    label.innerHTML = this.name + ":";
    propertyDiv.appendChild(label);

    // create a div for the control(s)
    var controlDiv = document.createElement('div');
    propertyDiv.appendChild(controlDiv);
    controlDiv.classList.add("property-control-div");
        
    // create a text box
    var input = document.createElement('textarea');
    controlDiv.appendChild(input);
    input.id = id;
    input.value = this.text;
    input.disabled = this.disabled;
    input.classList.add("property-control");
    input.classList.add("property-text");
    var text = this;
    input.onchange = function() {
        text.setText(this.value);
        document.getElementById(this.id).focus();
    };

    parent.appendChild(propertyDiv);

    // calculate the required height
    var height = input.scrollHeight;
    input.style.height = height + "px";
}

ROMText.prototype.setText = function(text) {
    
    // validate the text
    var encoding = this.rom.textEncoding[this.encoding];
    if (!encoding) return; // TODO: add default encoding
    var data = encoding.encode(text);
    text = encoding.decode(data);

    // return if the value didn't change
    var oldText = this.text;
    var oldData = this.data;
    if (data === oldData) {
        this.notifyObservers();
        return;
    }
    
    // functions to undo/redo
    var assembly = this;
    function updateExternal() {
        var external = assembly.rom.parseLink(assembly.external.replace("%i", assembly.parent.i));
        assembly.assemble(external.data);
        external.notifyObservers();
    }
    function redo() {
        assembly.text = text;
        assembly.data = data;
        assembly.notifyObservers();
        if (assembly.external) updateExternal();
    }
    function undo() {
        assembly.text = oldText;
        assembly.data = oldData;
        assembly.notifyObservers();
        if (assembly.external) updateExternal();
    }
        
    // perform an action to change the value
    var action = new ROMAction(this, undo, redo, "Set " + this.name);
    this.rom.doAction(action);
}

Object.defineProperty(ROMText.prototype, "formattedText", { get: function() {
    var encoding = this.rom.textEncoding[this.encoding];
    if (encoding) {
        return encoding.format(this.text);
    } else {
        return this.text;
    }
}});

Object.defineProperty(ROMText.prototype, "htmlText", { get: function() {
    var encoding = this.rom.textEncoding[this.encoding];
    if (encoding) {
        return encoding.format(this.text, true);
    } else {
        return this.text;
    }
}});

// ROMCharTable
function ROMCharTable(rom, definition, parent) {
    ROMObject.call(this, rom, definition, parent);
    this.type = ROMObject.Type.charTable;

    this.char = [];
    
    var keys = Object.keys(definition.char);
    for (var i = 0; i < keys.length; i++) {
        var key = keys[i];
        var num = Number(key);
        if (!isNumber(num)) continue;
        this.char[num] = definition.char[key];
    }
}

// ROMTextEncoding
function ROMTextEncoding(rom, definition, parent) {
    ROMObject.call(this, rom, definition, parent);
    this.type = ROMObject.Type.textEncoding;
    
    this.encodingTable = {};
    this.decodingTable = [];
    this.charTable = definition.charTable;
    
    if (!isArray(definition.charTable)) { return; }
    for (var i = 0; i < definition.charTable.length; i++) {
        var charTable = this.rom.charTable[this.charTable[i]];
        var keys = Object.keys(charTable.char);
        for (var c = 0; c < keys.length; c++) {
            var key = Number(keys[c]);
            var value = charTable.char[key];
            this.decodingTable[key] = value;
            this.encodingTable[value] = key;
        }
    }
}

ROMTextEncoding.prototype = Object.create(ROMObject.prototype);
ROMTextEncoding.prototype.constructor = ROMTextEncoding;

ROMTextEncoding.prototype.decode = function(data) {
    var text = "";
    var i = 0;
    var b1, b2, c;
    
    while (i < data.length) {
        c = null;
        b1 = data[i++];
        b2 = data[i++];
        if (b1) c = this.decodingTable[(b1 << 8) | b2];
        if (!c) {
            c = this.decodingTable[b1];
            i--;
        }
        
        if (!c) {
            text += "\\" + hexString(b1, 2);
        } else if (c == "\\0") {
            break; // string terminator
        } else if (c == "\\pad") {
            continue; // pad
        } else if (c.endsWith("[")) {
            text += c;
            b1 = data[i++] || 0;
            text += b1.toString();
            text += "]";
        } else {
            text += c;
        }
    }
    
    return text;
}

ROMTextEncoding.prototype.encode = function(text) {
    var data = [];
    var i = 0;
    var keys = Object.keys(this.encodingTable);
    
    while (i < text.length) {
        var remainingText = text.substring(i);
        var matches = keys.filter(function(s) {
            return remainingText.startsWith(s);
        });
        
        if (matches.length === 0) {
            this.rom.log("Invalid character: " + remainingText[0]);
            i++;
            continue;
        }
        
        var match = matches.reduce(function (a, b) {
            return a.length > b.length ? a : b;
        });
        
        // end of string
        if (match === "\\0") break;
        
        var value = this.encodingTable[match];
        i += match.length;
        
        if (match.endsWith("[")) {
            var end = text.indexOf("]", i);
            parameter = text.substring(i, end);
            var n = Number(parameter);
            if (!isNumber(n) || n > 0xFF) {
                this.rom.log("Invalid parameter: " + parameter);
                n = 0;
                end = i;
            }
            i = end + 1;
            value <<= 8;
            value |= n;
        }
        
        if (value > 0xFF) {
            data.push(value >> 8);
            data.push(value & 0xFF);
        } else {
            data.push(value);
        }
    }
    
    var terminator = this.encodingTable["\\0"];
    if (isNumber(terminator) && data[data.length - 1] !== terminator) {
        data.push(terminator);
    }
    
    return Uint8Array.from(data);
}


ROMTextEncoding.prototype.textLength = function(data) {
    var i = 0;
    var b1, b2, c;
    
    while (i < data.length) {
        c = null;
        b1 = data[i++];
        b2 = data[i++];
        if (b1) c = this.decodingTable[(b1 << 8) | b2];
        if (!c) {
            c = this.decodingTable[b1];
            i--;
        }
        
        if (!c) {
            continue;
        } else if (c === "\\0") {
            break; // string terminator
        } else if (c.endsWith("[")) {
            i++;
        }
    }
    
    return Math.min(i, data.length);
}

ROMTextEncoding.prototype.format = function(text, html) {
    
    var escapeKeys = Object.keys(this.encodingTable);
    escapeKeys = escapeKeys.filter(str => str.startsWith("\\"));
    escapeKeys = escapeKeys.sort(function(a, b) { return b.length - a.length; });
    
    for (var i = 0; i < escapeKeys.length; i++) {
        var key = escapeKeys[i];
        if (!text.includes(key)) continue;
        
        if (key.endsWith("[")) {
            var regex = new RegExp("\\" + key.slice(0, -1) + "\\\[([^\\\]]+)]", "g");
            text = text.replace(regex, "");
            continue;
        }
        
        var regex = new RegExp("\\" + key, "g");
        if (key === "\\n" || key === "\\page") {
            text = text.replace(regex, (html ? "<br/>" : "\n"));
        } else if (key === "\\choice") {
            for (var c = 1; text.includes(key); c++) {
                text = text.replace(key, c + ": ")
            }
        } else if (key.startsWith("\\char")) {
            var c = Number(key.slice(-2));
            var characterName = this.rom.stringTable.characterNames.formattedString(c);
            text = text.replace(regex, characterName);
        } else {
            text = text.replace(regex, "");
        }
    }
    return text;
}

// ROMStringTable
function ROMStringTable(rom, definition, parent) {
    ROMObject.call(this, rom, definition, parent);
    this.type = ROMObject.Type.stringTable;
    
    this.string = [];
    this.fString = [];
    this.observer = new ROMObserver(rom, this, null);
    var i = 0;
    
    // convert index strings to numbers
    if (definition.string) {
        var keys = Object.keys(definition.string);
        for (i = 0; i < keys.length; i++) {
            var key = keys[i];
            var range = ROMRange.parse(key)
            var n = Number(key);
            if (!range.isEmpty) {
                for (n = range.begin; n < range.end; n++) {
                    this.string[n] = definition.string[key];
                }
            } else if (isNumber(n)) {
                this.string[n] = definition.string[key];
            }
        }
    }
    
    // load default strings
    this.defaultString = definition.default;
    if (!this.defaultString) this.defaultString = "String %i";
    var length = definition.length;
    if (length) {
        for (i = 0; i < length; i++) {
            if (this.string[i]) continue;
            this.string[i] = this.defaultString;
        }
    }
}

ROMStringTable.prototype = Object.create(ROMObject.prototype);
ROMStringTable.prototype.constructor = ROMStringTable;

ROMStringTable.prototype.formattedString = function(i, maxLength) {
    if (this.fString[i]) return this.fString[i];
    
    var s = this.string[i];
    if (!s) return "Invalid String";

    // replace string index
    s = this.string[i].replace(/%i/g, i.toString());

    // replace links
    var links = s.match(/<([^>]+)>/g);
    if (!links) return s;
    
    for (var l = 0; l < links.length; l++) {
        var link = links[l];
        var object = this.rom.parseLink(link.substring(1, link.length - 1));
        this.observer.startObserving(object, this.reset);
        if (object instanceof ROMText) {
            s = s.replace(link, object.formattedText);
        } else if (isString(object)) {
            s = s.replace(link, object);
        } else {
            s = s.replace(link, "Invalid Link");
        }
    }
    if (maxLength && s.length > maxLength) s = s.substring(0, maxLength) + "…";
    this.fString[i] = s;
    return s;
}

ROMStringTable.prototype.reset = function() {
    this.observer.stopObservingAll();
    this.fString = [];
}

// ROMRange
function ROMRange(begin, end) {
    this.begin = begin;
    this.end = end;
}

Object.defineProperty(ROMRange.prototype, "isEmpty", {
    get: function() {
        return (this.end <= this.begin);
    }
});

Object.defineProperty(ROMRange.prototype, "length", {
    get: function() {
        return (this.end - this.begin);
    }
});

ROMRange.prototype.toString = function(pad) {
    return (hexString(this.begin, pad) + "-" + hexString(this.end, pad));
}

ROMRange.parse = function(expression) {
    var range = new ROMRange(0, 0);
    if (!isString(expression)) { return range; }
    var bounds = expression.split("-");
    if (bounds.length != 2) { return range; }
    var begin = Number(bounds[0]);
    var end = Number(bounds[1]);
    if (!isNumber(begin) || !isNumber(end)) { return range; }
    range.begin = begin;
    range.end = end;
    return range;
}

// misc. methods

// https://github.com/uxitten/polyfill/blob/master/string.polyfill.js
// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/padStart
if (!String.prototype.padStart) {
    String.prototype.padStart = function padStart(targetLength,padString) {
        targetLength = targetLength>>0; //truncate if number or convert non-number to 0;
        padString = String((typeof padString !== 'undefined' ? padString : ' '));
        if (this.length > targetLength) {
            return String(this);
        }
        else {
            targetLength = targetLength-this.length;
            if (targetLength > padString.length) {
                padString += padString.repeat(targetLength/padString.length); //append to original to ensure we are longer than needed
            }
            return padString.slice(0,targetLength) + String(this);
        }
    };
}

function Rect(l, r, t, b) {
    
    l = Number(l) || 0;
    r = Number(r) || 0;
    t = Number(t) || 0;
    b = Number(b) || 0;
    if (r <= l) { l = 0; r = 0; }
    if (b <= t) { t = 0; b = 0; }
    
    this.l = l;
    this.r = r;
    this.t = t;
    this.b = b;
}

Rect.prototype.isEmpty = function() {
    return (this.r <= this.l) || (this.b <= this.t);
}

Rect.prototype.isEqual = function(rect) {
    return (rect.l === this.l) &&
           (rect.r === this.r) &&
           (rect.t === this.t) &&
           (rect.b === this.b);
}

Rect.prototype.intersect = function(rect) {
    return new Rect(Math.max(this.l, rect.l),
                Math.min(this.r, rect.r),
                Math.max(this.t, rect.t),
                Math.min(this.b, rect.b));
}

Rect.prototype.contains = function(rect) {
    return this.intersect(rect).isEqual(rect);
}

Rect.prototype.containsPoint = function(x, y) {
    return (x >= this.l) &&
           (x < this.r) &&
           (y >= this.t) &&
           (y < this.b);
}

Rect.prototype.scale = function(x, y) {
    x = Number(x);
    y = Number(y) || x;
    
    return new Rect(this.l * x | 0, this.r * x | 0, this.t * y | 0, this.b * y | 0);
}

Rect.prototype.offset = function(x, y) {
    x = Number(x);
    y = Number(y);

    return new Rect(this.l + x, this.r + x, this.t + y, this.b + y);
}

Object.defineProperty(Rect.prototype, "w", {
    get: function() { return this.r - this.l; },
    set: function(w) { this.r = this.l + w; }
});

Object.defineProperty(Rect.prototype, "h", {
    get: function() { return this.b - this.t; },
    set: function(h) { this.b = this.t + h; }
});

// returns a hex string of a number with optional padding
function hexString(num, pad) {
    if (num < 0) num = 0xFFFFFFFF + num + 1;
    var hex = num.toString(16).toUpperCase();
    if (isNumber(pad)) hex = hex.padStart(pad, "0");
    return ("0x" + hex);
}

// returns if a value is a string
function isString(value) {
    return typeof value === 'string' || value instanceof String;
}

// returns if a value is really a number
function isNumber(value) {
    return typeof value === 'number' && isFinite(value);
}

// returns if a value is an array
function isArray(value) {
    return value && typeof value === 'object' && value.constructor === Array;
}

function compareTypedArrays(a1, a2) {
    
    if (a1 === a2) return true;
    
    if (a1.length !== a2.length) return false;
    
    var i = a1.length;
    while (i--) {
        if (a1[i] !== a2[i]) return false;
    }
    
    return true;
}
//
// ff6script.js
// created 3/21/2018
//

var FF6Script = {};
FF6Script.name = "FF6Script";

FF6Script.description = function(command) {
    var desc = "Invalid Command";
    var offset, label;
    switch (command.key) {
        case "objectScript":
            return "Object Script for " + FF6Script.string(command, "object", "eventObjects");
        case "objectWait":
            return "Wait for " + FF6Script.string(command, "object", "eventObjects");
        case "objectPassability":
            if (command.opcode.value === 0x36) {
                return "Disable Passability for " + FF6Script.string(command, "object", "eventObjects");
            } else if (command.opcode.value === 0x78) {
                return "Enable Passability for " + FF6Script.string(command, "object", "eventObjects");
            }
            break;
        case "dialog":
            var d = command.dialog.value;
            var dialog = command.rom.dialog.item(d);
            if (dialog) {
                return "Display Dialog:<br/>" + dialog.htmlText;
            } else {
                return "Display Dialog:<br/>Invalid Dialog Message";
            }
        case "default":
            desc = "Command " + hexString(command.opcode.value, 2);
            break;
        case "jumpBattleSwitch":
        case "jumpCharacter":
        case "jumpSub":
        case "jumpSubRepeat":
        case "jumpRandom":
            desc = command.name;
            offset = command.scriptPointer.value;
            if (command) desc += ": " + FF6Script.label(command.parent, offset);
            break;
        case "jumpDialog":
            desc = command.name;
            var choices = (command.data.length - 1) / 3;
            for (var c = 1; c <= choices; c++) {
                offset = command["scriptPointer" + c].value;
                label = FF6Script.label(command.parent, offset);
                desc += "<br/>" + c + ": ";
                desc += label;
            }
            break;
        case "jumpSwitch":
            offset = command.scriptPointer.value;
            label = FF6Script.label(command.parent, offset);
            var count = command.count.value;
            var anyAll = command.anyAll.value ? "all" : "any";
            
            desc = "Jump to " + label + " if " + anyAll + " of these are true:"
            for (var s = 1; s <= count; s++) {
                var eventSwitch = this.string(command, "switch" + s, "eventSwitches");
                var state = command["state" + s].value ? "On" : "Off";
                desc += "<br/>" + s + ". " + eventSwitch + " == " + state;
            }
            break;
            
        case "switch":
            desc = this.string(command, "switch", "eventSwitches");
            desc += " = " + (command.onOff.value ? "Off" : "On");
            break;
            
        default:
            desc = command.name;
            break;
    }
    return desc;
}

FF6Script.string = function(command, key, stringKey) {
    return command.rom.stringTable[stringKey].formattedString(command[key].value);
}

FF6Script.label = function(script, offset) {
    if (script.ref[offset]) return script.ref[offset].label;
    return "Invalid Command";
}

FF6Script.initScript = function(script) {
    
    // add references for each map's events
    var triggers, m, t, offset, label;
        
    // event triggers
    for (m = 0; m < script.rom.eventTriggers.array.length; m++) {
        triggers = script.rom.eventTriggers.item(m);
        for (t = 0; t < triggers.array.length; t++) {
            offset = triggers.item(t).scriptPointer.value;
            script.addPlaceholder(triggers.item(t).scriptPointer, offset, (m < 3) ? "world" : "event");
        }
    }
    
    // npcs
    for (m = 3; m < script.rom.npcProperties.array.length; m++) {
        triggers = script.rom.npcProperties.item(m);
        for (t = 0; t < triggers.array.length; t++) {
            var npc = triggers.item(t);
            if (npc.vehicle.value === 0 && npc.special.value) continue;
            offset = triggers.item(t).scriptPointer.value;
            script.addPlaceholder(triggers.item(t).scriptPointer, offset, "event");
        }
    }
    
    // startup event
    for (m = 3; m < script.rom.mapProperties.array.length; m++) {
        offset = script.rom.mapProperties.item(m).scriptPointer.value;
        label = script.rom.stringTable.mapProperties.formattedString(m);
        script.addPlaceholder(script.rom.mapProperties.item(m).scriptPointer, offset, "event", label);
    }
    
    // add references for vehicle events
    for (var e = 0; e < script.rom.vehicleEvents.array.length; e++) {
        offset = script.rom.vehicleEvents.item(e).scriptPointer.value;
        label = script.rom.stringTable.vehicleEvents.formattedString(e);
        script.addPlaceholder(script.rom.vehicleEvents.item(e).scriptPointer, offset, "vehicle", label);
    }

    // add references for ff6 advance events
    
}

FF6Script.didDisassemble = function(command, data) {
    
    var offset;
    
    switch (command.key) {
            
        case "objectEvent":
        case "startTimer":
        case "jumpSub":
        case "jumpSubRepeat":
        case "jumpBattleSwitch":
        case "jumpRandom":
        case "jumpKeypress":
        case "jumpDirection":
            offset = command.scriptPointer.value;
            command.parent.addPlaceholder(command.scriptPointer, offset, command.encoding);
            break;

        case "jumpEvent":
            offset = command.scriptPointer.value;
            command.parent.addPlaceholder(command.scriptPointer, offset, "event");
            break;

        case "jumpCharacter":
            var count = command.count.value;
            command.range.end += count * 3;
            ROMData.prototype.disassemble.call(command, data);
            offset = command.scriptPointer.value;
            command.parent.addPlaceholder(command.scriptPointer, offset, command.encoding);
            break;

        case "jumpDialog":
            // default to 2 choices
            var choices = 2;
            
            // find the previous dialog command
            var c = command.parent.command.length - 1;
            while (true) {
                var previous = command.parent.command[c--];
                if (!previous) break;
                if (previous.key !== "dialog") continue;
                
                // get the previous dialog text
                var d = previous.dialog.value;
                var dialog = command.rom.dialog.item(d);
                if (!dialog || !dialog.text) continue;

                // count the number of dialog choices
                var matches = dialog.text.match(/\\choice/g);

                // keep looking if there were no dialog choices
                if (!matches) continue;
                choices = matches.length;
                break;
            }
            command.range.end += choices * 3;
            command.count.value = choices;
            
//            var scriptPointerDefinition = {
//                "type": "property",
//                "mask": "0xFFFFFF",
//                "script": "eventScript"
//            }
//            
//            for (c = 1; c <= choices; c++) {
//                scriptPointerDefinition.begin = c * 3 - 2;
//                scriptPointerDefinition.name = "Script Pointer " + c;
//                scriptPointerDefinition.key = "scriptPointer" + c;
//                command.addAssembly(scriptPointerDefinition);
//            }
            
            ROMData.prototype.disassemble.call(command, data);
            for (c = 1; c <= choices; c++) {
                offset = command["scriptPointer" + c].value;
                command.parent.addPlaceholder(command["scriptPointer" + c], offset, "event");
            }
            break;

        case "jumpSwitch":
            var count = command.count.value;
            var length = count * 2 + 4;
            
            // update the command's range
            command.range.end = command.range.begin + length;
            command.assembly.scriptPointer.range = new ROMRange(length - 3, length);
            ROMData.prototype.disassemble.call(command, data);
            
            // add a placeholder at the jump offset
            offset = command.scriptPointer.value;
            command.parent.addPlaceholder(command.scriptPointer, offset, command.encoding);
            break;
            
        case "objectScript":
            offset = command.range.end + command.scriptLength.value;
            command.parent.addPlaceholder(null, offset, "event");
            break;
            
        case "mapBackground":
            var w = command.w.value;
            var h = command.h.value;
            command.range.end += w * h;
            ROMData.prototype.disassemble.call(command, data);
            break;

        case "switch":
            if (command.encoding === "event") {
                command.switch.value += command.bank.value << 8;
            } else if (command.encoding === "object") {
                var opcode = command.opcode.value;
                if (opcode < 0xE4) {
                    command.onOff.value = 0;
                    opcode -= 0xE1;
                } else {
                    command.onOff.value = 1;
                    opcode -= 0xE4;
                }
                command.switch.value += (opcode << 8);
            }
            break;
            
        default:
            break;
    }
}

FF6Script.willAssemble = function(command) {
    switch (command.key) {
        case "objectScript":
            // find the end of the object script
            var script = command.parent;
            var i = script.command.indexOf(command);
            while (++i < script.command.length) {
                var nextCommand = script.command[i];
                if (nextCommand.encoding !== "object") break;
            }
            var length = nextCommand.range.begin - command.range.end;
            if (length === command.scriptLength.value) break;
            command.scriptLength.value = length;
            command.scriptLength.markAsDirty();
            break;
            
        case "switch":
            if (command.encoding !== "event") break;
            command.bank.value = command.switch.value >> 8;
            break;

        case "jumpSwitch":
            var count = command.count.value;
            var length = count * 2 + 4;
            command.range.end = command.range.begin + length;
            command.assembly.scriptPointer.range = new ROMRange(length - 3, length);
            break;

        default:
            break;
    }
}

FF6Script.nextEncoding = function(command) {
    switch (command.key) {
        case "objectScript":
            return "object";
            
        case "map":
            if (command.map.value >= 3 && command.map.value !== 511) return "event";
            if (command.vehicle.value) return "vehicle";
            return "world";
            
        case "end":
            return "event";

        default:
            return command.encoding;
    }
}
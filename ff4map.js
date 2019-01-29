//
// ff4map.js
// created 3/17/2018
//

// Jap translations: http://ff4.wikidot.com/weapons

function FF4Map(rom) {
    
    this.rom = rom;
    this.name = "FF4Map";
    this.tileset = new FF4MapTileset(rom, this);
    
    this.div = document.createElement('div');
    this.div.id = 'map-edit';
    
    this.scrollDiv = document.createElement('div');
    this.scrollDiv.classList.add('no-select');
    this.div.appendChild(this.scrollDiv);
    
    this.canvas = document.createElement('canvas');
    this.canvas.id = "map";
    this.canvas.width = 256;
    this.canvas.height = 256;
    this.scrollDiv.appendChild(this.canvas);
    
    this.cursorCanvas = document.createElement('canvas');
    this.cursorCanvas.id = "map-cursor";
    this.cursorCanvas.width = 16;
    this.cursorCanvas.height = 16;
    this.scrollDiv.appendChild(this.cursorCanvas);

    this.mapCanvas = document.createElement('canvas');
    this.mapCanvas.width = 256;
    this.mapCanvas.height = 256;
    this.mapSectors = [];
    this.dirtyRect = null;
    this.mapRect = new Rect(0, 0, 256, 256);
    this.npcCanvas = document.createElement('canvas');
    this.menu = document.getElementById("menu");

    this.mapProperties = null;
    this.m = null; // map index
    this.l = 0; // selected layer
    this.zoom = 1.0; // zoom multiplier
    this.selection = new Uint8Array([0x73, 0, 0, 1, 1, 0]);
    this.clickedCol = null;
    this.clickedRow = null;
    this.clickButton = null;
    this.isDragging = false;
    this.layer = [new FF4MapLayer(rom, FF4MapLayer.Type.layer1),
                  new FF4MapLayer(rom, FF4MapLayer.Type.layer2)];
    this.selectedLayer = this.layer[0];
    this.worldLayer = new FF4MapLayer(rom, FF4MapLayer.Type.world);
    this.triggers = [];
    this.showCursor = false;
    this.selectedTrigger = null;
    this.isWorld = false;
    this.observer = new ROMObserver(rom, this, {sub: true, link: true, array: true});
    this.ppu = new GFX.PPU();

    var map = this;
    this.div.onscroll = function() { map.scroll() };
//    window.addEventListener("resize", map.scroll, false);
    this.scrollDiv.onmousedown = function(e) { map.mouseDown(e) };
    this.scrollDiv.onmouseup = function(e) { map.mouseUp(e) };
    this.scrollDiv.onmousemove = function(e) { map.mouseMove(e) };
    this.scrollDiv.onmouseenter = function(e) { map.mouseEnter(e) };
    this.scrollDiv.onmouseleave = function(e) { map.mouseLeave(e) };
    this.scrollDiv.oncontextmenu = function(e) { map.openMenu(e); return false; };

    var buttonLayer1 = document.getElementById("showLayer1");
    buttonLayer1.onchange = function() { map.changeLayer("showLayer1"); twoState(this); };
    buttonLayer1.parentElement.childNodes[1].nodeValue = "Layer 1";
    buttonLayer1.parentElement.style.display = "inline-block";
    this.showLayer1 = buttonLayer1.checked;

    var buttonLayer2 = document.getElementById("showLayer2");
    buttonLayer2.onchange = function() { map.changeLayer("showLayer2"); twoState(this); };
    buttonLayer2.parentElement.childNodes[1].nodeValue = "Layer 2";
    buttonLayer2.parentElement.style.display = "inline-block";
    this.showLayer2 = buttonLayer2.checked;

    var buttonLayer3 = document.getElementById("showLayer3");
    buttonLayer3.onchange = null;
    buttonLayer3.parentElement.style.display = "none";
    this.showLayer3 = buttonLayer3.checked;

    var buttonTriggers = document.getElementById("showTriggers");
    buttonTriggers.onchange = function() { map.changeLayer("showTriggers"); twoState(this); };
    buttonTriggers.parentElement.childNodes[1].nodeValue = "Triggers";
    buttonTriggers.parentElement.style.display = "inline-block";
    this.showTriggers = buttonTriggers.checked;

//    document.getElementById("showLayer1").onchange = function() { map.changeLayer("showLayer1"); twoState(this); };
//    document.getElementById("showLayer2").onchange = function() { map.changeLayer("showLayer2"); twoState(this); };
//    document.getElementById("showLayer3").onchange = null;
//    document.getElementById("showTriggers").onchange = function() { map.changeLayer("showTriggers"); twoState(this); };
//    this.showLayer1 = document.getElementById("showLayer1").checked;
//    this.showLayer2 = document.getElementById("showLayer2").checked;
//    this.showTriggers = document.getElementById("showTriggers").checked;
    document.getElementById("zoom").onchange = function() { map.changeZoom(); };
    
    this.initBattleGroups();
}

FF4Map.prototype.initBattleGroups = function() {
    // set the battle offset for underground and moon maps
    for (var m = 256; m < 512; m++) {
        var b = this.rom.mapBattle.item(m).battleGroup.value;
        if (b === 0) continue;
        var battleGroup = this.rom.battleGroup.item(b);
        for (var i = 1; i <= 8; i++) {
            var battle = battleGroup["battle" + i.toString()];
            if (battle.offset === 256) continue;
            battle.offset = 256;
            battle.value += 256;
        }
    }
    
    for (m = 64; m < 84; m++) {
        var b = this.rom.worldBattle.item(m).battleGroup.value;
        if (b === 0) continue;
        var battleGroup = this.rom.battleGroupWorld.item(b);
        for (var i = 1; i <= 8; i++) {
            var battle = battleGroup["battle" + i.toString()];
            if (battle.offset === 256) continue;
            battle.offset = 256;
            battle.value += 256;
        }
    }
}

FF4Map.prototype.changeZoom = function() {
    
    // save the old scroll location
    var x = this.div.scrollLeft;
    var y = this.div.scrollTop;
    var w = this.div.clientWidth;
    var h = this.div.clientHeight;
    x = (x + w / 2) / this.zoom;
    y = (y + h / 2) / this.zoom;
    
    this.zoom = Math.pow(2, Number(document.getElementById("zoom").value));
    
    var zoomValue = document.getElementById("zoom-value");
    zoomValue.innerHTML = (this.zoom * 100).toString() + "%";
    
    this.div.scrollLeft = x * this.zoom - (w >> 1);
    this.div.scrollTop = y * this.zoom - (h >> 1);
        
    this.scrollDiv.style.width = (this.ppu.width * this.zoom).toString() + "px";
    this.scrollDiv.style.height = (this.ppu.height * this.zoom).toString() + "px";

    this.scroll();
}

FF4Map.prototype.scroll = function() {
    
    this.closeMenu();

    // get the visible dimensions
    var x = this.div.scrollLeft;
    var y = this.div.scrollTop;
    var w = this.div.clientWidth;
    var h = this.div.clientHeight;

    var margin = Math.max(w, h) >> 2;
    this.mapRect.r = Math.min(x + w + margin, this.ppu.width * this.zoom);
    this.mapRect.l = Math.max(0, Math.min(x - margin, this.mapRect.r - w));
    this.mapRect.b = Math.min(y + h + margin, this.ppu.height * this.zoom);
    this.mapRect.t = Math.max(0, Math.min(y - margin, this.mapRect.b - h));
        
    this.canvas.style.left = this.mapRect.l.toString() + "px";
    this.canvas.style.top = this.mapRect.t.toString() + "px";
    this.canvas.width = this.mapRect.w;
    this.canvas.height = this.mapRect.h;

    this.drawMap();
}

FF4Map.prototype.mouseDown = function(e) {

    this.closeMenu();
    this.clickedCol = ((e.offsetX / this.zoom + this.ppu.layers[this.l].x) % this.ppu.width) >> 4;
    this.clickedRow = ((e.offsetY / this.zoom + this.ppu.layers[this.l].y) % this.ppu.height) >> 4;
    this.clickButton = e.button;
    
    // update the selection position
    this.selection[1] = this.clickedCol;
    this.selection[2] = this.clickedRow;

    if (this.l === 3) {
        var triggers = this.triggersAt(e.offsetX, e.offsetY);
        var index = triggers.indexOf(this.selectedTrigger);
        if (index !== -1) {
            // select the next trigger in a stack
            var t = (index + 1) % triggers.length;
            this.selectTrigger(triggers[t]);
            this.isDragging = true;
        } else if (triggers.length !== 0) {
            // select the first trigger
            this.selectTrigger(triggers[0]);
            this.isDragging = true;
        } else {
            // clear trigger selection
            this.selectedTrigger = null;
            if (this.isWorld) {
                // select world map battle
                this.selectWorldBattle(this.clickedCol, this.clickedRow);
            } else {
                // select map properties
                this.rom.select(this.mapProperties);
            }
            this.isDragging = false;
        }
    } else if (this.clickButton === 2) {
        this.selectTiles();
        this.isDragging = true;
    } else {
        this.rom.beginAction();
        this.rom.pushAction(new ROMAction(this, this.drawMap, null, "Redraw Map"));
        this.rom.doAction(new ROMAction(this.selectedLayer, this.selectedLayer.decodeLayout, null, "Decode Layout"));
        this.setTiles();
        this.isDragging = true;
    }
    
    this.drawCursor();
}

FF4Map.prototype.mouseUp = function(e) {

    if (this.l === 3 && this.selectedTrigger && this.isDragging) {
        // save the new trigger position
        var col = this.selectedTrigger.x.value;
        var row = this.selectedTrigger.y.value;
        
        if (col != this.clickedCol || row !== this.clickedRow) {
            // move the trigger back to its old position
            this.selectedTrigger.x.value = this.clickedCol;
            this.selectedTrigger.y.value = this.clickedRow;

            // set the new trigger position (and trigger undo)
            this.observer.stopObserving(this.selectedTrigger);
            this.rom.beginAction();
            this.selectedTrigger.x.setValue(col);
            this.selectedTrigger.y.setValue(row);
            this.rom.endAction();
            this.observer.startObserving(this.selectedTrigger, this.drawMap);
        }
    } else if (this.rom.action && this.isDragging) {
        this.rom.doAction(new ROMAction(this.selectedLayer, null, this.selectedLayer.decodeLayout, "Decode Layout"));
        this.rom.pushAction(new ROMAction(this, null, this.drawMap, "Redraw Map"));
        this.rom.endAction();
    }
    
    this.isDragging = false;
    this.clickButton = null;
}

FF4Map.prototype.mouseMove = function(e) {
    
    // return if the menu is open
    if (this.menu.classList.contains("active")) return;

    var col = ((e.offsetX / this.zoom + this.ppu.layers[this.l].x) % this.ppu.width) >> 4;
    var row = ((e.offsetY / this.zoom + this.ppu.layers[this.l].y) % this.ppu.height) >> 4;

    // update the displayed coordinates
    var coordinates = document.getElementById("coordinates");
    coordinates.innerHTML = "(" + col + ", " + row + ")";

    // return if the cursor position didn't change
    if (this.selection[1] === col && this.selection[2] === row) return;

    // update the selection position
    this.selection[1] = col;
    this.selection[2] = row;

    if (!this.isDragging) {
        // update the cursor
        this.drawCursor();
        return;
    }

    if (this.l === 3 && this.selectedTrigger) {

        if (this.selectedTrigger.x.value !== col || this.selectedTrigger.y.value !== row) {
            this.selectedTrigger.x.value = col;
            this.selectedTrigger.y.value = row;
            this.invalidateMap(this.rectForTrigger(this.selectedTrigger).scale(1 / this.zoom));
            this.drawMap();
        }
    } else if (this.clickButton === 2) {
        this.selectTiles();
    } else {
        this.setTiles();
    }

    // update the cursor
    this.drawCursor();
}

FF4Map.prototype.mouseEnter = function(e) {
    
    // show the cursor
    this.showCursor = true;
    this.drawCursor();

    this.mouseUp(e);
}

FF4Map.prototype.mouseLeave = function(e) {
    
    // hide the cursor
    this.showCursor = (this.l === 3);
    this.drawCursor();
    
    this.mouseUp(e);
}

FF4Map.prototype.updateMenu = function() {
    this.menu.innerHTML = "";
    
    var self = this;
    function appendMenuItem(label, onclick) {
        var li = document.createElement('li');
        li.classList.add("menu-item");
        li.innerHTML = label;
        if (onclick) {
            li.onclick = onclick;
        } else {
            li.classList.add("menu-item-disabled");
        }
        self.menu.appendChild(li);
    }
    
    appendMenuItem("Insert Entrance Trigger", function() {self.insertTrigger()});
    appendMenuItem("Insert Event Trigger", function() {self.insertTrigger('eventTriggers')});
    appendMenuItem("Insert Treasure", this.isWorld ? null : function() {self.insertTrigger('treasureProperties')});
    appendMenuItem("Insert NPC", this.isWorld ? null : function() {self.insertNPC()});
    appendMenuItem("Delete Trigger", !this.selectedTrigger ? null : function() {self.deleteTrigger()});
}

FF4Map.prototype.openMenu = function(e) {
    if (this.l !== 3) return; // no menu unless editing triggers
    this.updateMenu();
    
    this.clickedCol = ((e.offsetX / this.zoom + this.ppu.layers[this.l].x) % this.ppu.width) >> 4;
    this.clickedRow = ((e.offsetY / this.zoom + this.ppu.layers[this.l].y) % this.ppu.height) >> 4;

    this.menu.classList.add("menu-active");
    this.menu.style.left = e.x + "px";
    this.menu.style.top = e.y + "px";
}

FF4Map.prototype.closeMenu = function() {
    this.menu.classList.remove("menu-active");
}

FF4Map.prototype.setTiles = function() {
    // return if not dragging
    if (!isNumber(this.clickedCol) || !isNumber(this.clickedRow)) return;

    var col = this.selection[1];
    var row = this.selection[2];
    var cols = this.selection[3];
    var rows = this.selection[4];
    
    var l = ((col << 4) - this.ppu.layers[this.l].x) & (this.ppu.width - 1);
    var r = l + (cols << 4);
    var t = ((row << 4) - this.ppu.layers[this.l].y) & (this.ppu.height - 1);
    var b = t + (rows << 4);
    var rect = new Rect(l, r, t, b);

    function invalidate() { this.invalidateMap(rect); }
    this.selectedLayer.setLayout(this.selection);
    this.rom.doAction(new ROMAction(this, invalidate, invalidate, "Invalidate Map"));
    this.drawMap();
}

FF4Map.prototype.selectTrigger = function(trigger) {
    this.selectedTrigger = trigger;
    this.rom.select(trigger);
    if (!trigger) return;
    this.clickedCol = this.selectedTrigger.x.value;
    this.clickedRow = this.selectedTrigger.y.value;

    if (this.selectedTrigger.key === "npcProperties") {
        var script = this.rom.npcScript.item(trigger.switch.value);
        this.rom.select(script);
//        scriptList.selectRef(ref.scriptPointer.value);
    } else if (this.selectedTrigger.key === "eventTriggers") {
//        var ref = this.rom.triggerPointers.item(trigger.event.value);
//        this.rom.select(this.rom.triggerScript);
//        scriptList.selectRef(ref.scriptPointer.value);
    }
    this.rom.select(trigger);
}

FF4Map.prototype.selectTiles = function() {
    // return if not dragging
    if (!isNumber(this.clickedCol) || !isNumber(this.clickedRow)) return;
    
    var col = this.selection[1];
    var row = this.selection[2];
    var cols = Math.abs(col - this.clickedCol) + 1;
    var rows = Math.abs(row - this.clickedRow) + 1;
    col = Math.min(col, this.clickedCol);
    row = Math.min(row, this.clickedRow);

    this.selection = this.selectedLayer.getLayout(col, row, cols, rows);
    this.selection[2] |= this.l << 6;
    
    if (rows !== 1 || cols !== 1) {
        this.tileset.selection = null;
    } else {
        // select a single tile in the tileset view
        var tile = this.selection[5];
        this.tileset.selection = new Uint8Array([0x73, tile & 0x0F, tile >> 4, 1, 1, tile]);
        this.selectTileProperties(tile);
    }
    this.tileset.drawCursor();
}

FF4Map.prototype.selectTileProperties = function(t) {
    // select tile properties
    var tileProperties;
    if (this.selectedLayer.type === FF4MapLayer.Type.layer1) {
        // layer 1 tile properties determined by graphics index
        tileProperties = this.rom.mapTileProperties.item(this.mapProperties.graphics.value);
    } else if (this.selectedLayer.type === FF4MapLayer.Type.world) {
        // world map tile properties
        tileProperties = this.rom.worldTileProperties.item(this.m - 251);
    } else {
        // return if layer 2
        return;
    }
    this.rom.select(tileProperties.item(t));
}

FF4Map.prototype.selectLayer = function(l) {
    // set the selected layer
    l = Number(l);
    if (isNumber(l)) this.l = l;
    
    if (this.isWorld) {
        this.selectedLayer = this.worldLayer;
    } else {
        this.selectedLayer = this.layer[this.l]
    }
    
    this.showCursor = (this.l === 3);
    this.drawCursor();
}

FF4Map.prototype.selectWorldBattle = function(x, y) {
    x >>= 5;
    y >>= 5;

    var sector;
    if (this.m === 251) {
        // overworld
        x &= 7;
        y &= 7;
        sector = x + (y << 3);
    } else if (this.m === 252) {
        // underground
        offset = 64;
        x &= 3;
        y &= 3;
        sector = x + (y << 2) + 64;
    } else if (this.m === 253) {
        // moon
        offset = 80;
        x &= 1;
        y &= 1;
        sector = x + (y << 1) + 80;
    }
    
    var battleGroup = this.rom.worldBattle.item(sector);
    this.rom.select(battleGroup);
}

FF4Map.prototype.changeLayer = function(id) {
    this[id] = document.getElementById(id).checked;
    var map = this.rom.mapProperties.item(this.m);
    this.ppu.layers[0].main = this.showLayer1;
    if (!this.isWorld) {
        this.ppu.layers[0].sub = this.showLayer1 && this.mapProperties.addition.value;
        this.ppu.layers[1].main = this.showLayer2;
    }
    this.invalidateMap();
    this.drawMap();
}

FF4Map.prototype.drawCursor = function() {
    
    this.cursorCanvas.style.display = "none";
    if (!this.showCursor) return;
    
    var col = this.selection[1];
    var row = this.selection[2];

    // get the cursor geometry and color
    var x = ((col << 4) - this.ppu.layers[this.l].x) & (this.ppu.width - 1);
    x *= this.zoom;
    var y = ((row << 4) - this.ppu.layers[this.l].y) & (this.ppu.height - 1);
    y *= this.zoom;
    var w = this.selection[3] << 4;
    w *= this.zoom;
    var h = this.selection[4] << 4;
    h *= this.zoom;
    var colors = ["green", "blue", "red", "white"];
    var c = colors[this.l];

    // draw the cursor around the selected trigger
    if (this.l === 3) {
        if (!this.selectedTrigger || this.triggers.indexOf(this.selectedTrigger) === -1) return;
        x = this.selectedTrigger.x.value * 16 * this.zoom;
        y = this.selectedTrigger.y.value * 16 * this.zoom;
        w = 16 * this.zoom;
        h = 16 * this.zoom;

        if (this.selectedTrigger.vertical) {
            var length = this.selectedTrigger.length.value;
            var vertical = this.selectedTrigger.vertical.value;
            if (vertical) {
                h = 16 * this.zoom * (length);
            } else {
                w = 16 * this.zoom * (length);
            }
        }

        switch (this.selectedTrigger.key) {
            case "eventTriggers": c = "rgba(0, 0, 255, 1.0)"; break;
            case "entranceTriggers": c = "rgba(255, 0, 0, 1.0)"; break;
            case "treasureProperties": c = "rgba(255, 255, 0, 1.0)"; break;
            case "npcProperties": c = "rgba(128, 128, 128, 1.0)"; break;
        }
    }
    
    // draw the cursor
    w = Math.min(this.ppu.width * this.zoom - x, w);
    h = Math.min(this.ppu.height * this.zoom - y, h);
    if (w <= 0 || h <= 0) return;

    // set up the cursor canvas
    this.cursorCanvas.width = w;
    this.cursorCanvas.height = h;
    this.cursorCanvas.style.left = x.toString() + "px";
    this.cursorCanvas.style.top = y.toString() + "px";
    this.cursorCanvas.style.display = "block";
    var ctx = this.cursorCanvas.getContext('2d');
    
    // convert the selection to screen coordinates
    ctx.lineWidth = 1;
    ctx.strokeStyle = "black";
    x = 0.5; y = 0.5; w--; h--;
    ctx.strokeRect(x, y, w, h);
    x++; y++; w -= 2; h -= 2;
    ctx.strokeStyle = c;
    ctx.strokeRect(x, y, w, h);
    x++; y++; w -= 2; h -= 2;
    ctx.strokeStyle = "white";
    ctx.strokeRect(x, y, w, h);
    x++; y++; w -= 2; h -= 2;
    ctx.strokeStyle = "black";
    ctx.strokeRect(x, y, w, h);
}

FF4Map.prototype.selectObject = function(object) {
    document.getElementById("tileset-div").classList.remove('hidden');
    document.getElementById("tileset-layers").classList.remove('hidden');
    document.getElementById("map-controls").classList.remove('hidden');
    this.loadMap(object.i);
}

FF4Map.prototype.loadMap = function(m) {
    
    var layerButtons = document.getElementsByClassName("toolbox-button");
    layerButtons[1].disabled = false;
    layerButtons[2].disabled = true;

    // set the map index
    m = Number(m);
    if (isNumber(m) && this.m !== m) {
        // map changed
        this.m = m;
        this.observer.stopObservingAll();
        if ((this.m === 0xFB) || (this.m === 0xFC) || (this.m === 0xFD) || (this.m === 0x1FB) || (this.m === 0x1FC) || (this.m === 0x1FD)) {
            if (this.m > 256) this.m -= 256;
            this.isWorld = true;
            this.loadWorldMap(this.m);
            return;
        }
        this.isWorld = false;
        this.mapProperties = this.rom.mapProperties.item(this.m);
        this.observer.startObserving(this.mapProperties, this.loadMap);
    }    

    // get map properties
    var map = this.mapProperties;
    if (!map) return;
    
    // set the map background
    var battleEditor = this.rom.getEditor("FF4Battle");
    battleEditor.bg = map.battleBackground.value;
    battleEditor.altPalette = map.battleBackgroundPalette.value;

    // load graphics
    var gfx = new Uint8Array(0x10000);
    if ((map.graphics.value === 0) || (map.graphics.value === 15)) {
        gfx.set(this.rom["mapGraphics" + map.graphics.value].data);
    } else {
        var g1 = this.rom["mapGraphics" + map.graphics.value].data;
        var g2 = this.rom["mapGraphics" + (map.graphics.value + 1)].data;
        gfx.set(g1, 0);
        gfx.set(g2, g1.length);
    }

    // load animation graphics
    var animTable = [0, 0, 0, 2, 3, 6, 7, 10, 10, 10, 10, 10, 13, 13, 13, 16];
    var animGfx = this.rom.mapAnimationGraphics.data;
    for (var i = 0; i < 4; i++) {
        var a = animTable[map.graphics.value] + i;
        var start = a * 0x0400;
        var end = start + 0x0100;
        gfx.set(animGfx.subarray(start, end), 0x4800 + i * 0x0100);
    }

    // load palette
    var pal = new Uint32Array(128);
    if ((map.graphics.value === 0) || (map.graphics.value === 15)) {
        var pal1 = this.rom.mapPalettes.item(map.palette.value).data;
        var pal2 = this.rom.mapPalettes.item(map.palette.value + 1).data;
        for (var p = 0; p < 7; p++) {
            pal.set(pal1.subarray(p * 8, p * 8 + 8), (p + 1) * 16);
            pal.set(pal2.subarray(p * 8, p * 8 + 8), (p + 1) * 16 + 8);
        }
    } else {
        var pal1 = this.rom.mapPalettes.item(map.palette.value).data;
        for (var p = 0; p < 7; p++) {
            pal.set(pal1.subarray(p * 8, p * 8 + 8), (p + 1) * 16);
        }
    }
    pal[0] = 0xFF000000; // set background color to black

    var layout, tileset;
    var tileset = this.rom.mapTilesets.item(map.graphics.value).data;

    // load and de-interlace tile layouts
    var l1 = map.layout1.value;
    if (l1 === 0xFF) {
        layout = new Uint8Array(0x0400);
        layout.fill(map.fill);
    } else {
        if (map.layoutMSB.value || this.m >= 256) l1 += 256;
        layout = this.rom.mapLayouts.item(l1);
    }
    this.layer[0].loadLayout({layout: layout, tileset: tileset, w: 32, h: 32});

    var l2 = map.layout2.value;
    if (l2 === 0xFF) {
        layout = new Uint8Array(0x0400);
        layout.fill(map.fill);
    } else {
        if (map.layoutMSB.value || this.m >= 256) l2 += 256;
        layout = this.rom.mapLayouts.item(l2);
    }
    this.layer[1].loadLayout({layout: layout, tileset: tileset, w: 32, h: 32});

    // set up the ppu
    this.ppu = new GFX.PPU();
    this.ppu.pal = pal;
    this.ppu.height = 32 * 16;
    this.ppu.width = 32 * 16;
    this.ppu.back = true;
    this.ppu.subtract = false;
    this.ppu.half = map.addition.value;

    // layer 1
    this.ppu.layers[0].format = GFX.TileFormat.snes4bppTile;
    this.ppu.layers[0].cols = this.layer[0].w * 2;
    this.ppu.layers[0].rows = this.layer[0].h * 2;
    this.ppu.layers[0].z[0] = GFX.Z.snes1L;
    this.ppu.layers[0].z[1] = GFX.Z.snes1H;
    this.ppu.layers[0].gfx = gfx;
    this.ppu.layers[0].tiles = this.layer[0].tiles;
    this.ppu.layers[0].main = this.showLayer1; // layer 1 always in main screen
    this.ppu.layers[0].sub = this.showLayer1 && map.addition.value;
    this.ppu.layers[0].math = map.addition.value;

    // layer 2
    this.ppu.layers[1].format = GFX.TileFormat.snes4bppTile;
    this.ppu.layers[1].cols = this.layer[1].w * 2;
    this.ppu.layers[1].rows = this.layer[1].h * 2;
    this.ppu.layers[1].z[0] = GFX.Z.snes2L;
    this.ppu.layers[1].z[1] = GFX.Z.snes2H;
    this.ppu.layers[1].gfx = gfx;
    this.ppu.layers[1].tiles = this.layer[1].tiles;
    this.ppu.layers[1].main = this.showLayer2;
    this.ppu.layers[1].sub = false;
    this.ppu.layers[1].math = map.addition.value;

    this.scrollDiv.style.width = (this.ppu.width * this.zoom).toString() + "px";
    this.scrollDiv.style.height = (this.ppu.height * this.zoom).toString() + "px";
    this.mapCanvas.width = this.ppu.width;
    this.mapCanvas.height = this.ppu.height;

    this.invalidateMap();
    this.selectedTrigger = null;
    this.loadTriggers();
    this.scroll();
    
    this.tileset.loadMap(this.m);
}

FF4Map.prototype.loadWorldMap = function(m) {
    
    if (this.selectedLayer && this.selectedLayer.type === "layer2") {
        this.selectLayer(0);
    }
    var layerButtons = document.getElementsByClassName("toolbox-button");
    layerButtons[1].disabled = true;
    layerButtons[2].disabled = true;

    this.mapProperties = null;
    this.rom.select(null);

    // set the map background
    var battleEditor = this.rom.getEditor("FF4Battle");
    if (this.m === 251) {
        battleEditor.bg = 0;
    } else if (this.m === 252) {
        battleEditor.bg = 15;
    } else if (this.m === 253) {
        battleEditor.bg = 5;
    }
    battleEditor.altPalette = false;

    // load graphics and layout
    var w = 0; // world
    var size = 256;
    if (m === 0xFC) {
        w = 1; // underground
    } else if (m === 0xFD) {
        w = 2; // moon
        size = 64;
    }

    var gfx = this.rom.worldGraphics.item(w).data;
    var pal = this.rom.worldPalettes.item(w).data;
    var paletteAssignment = this.rom.worldPaletteAssignments.item(w).data;
    var tileset = this.rom.worldTilesets.item(w).data;

    var layout = [];
    for (var i = 0; i < size; i++) {
        layout.push(rom["worldLayout" + w].item(i));
    }
    
    this.worldLayer.loadLayout({layout: layout, tileset: tileset, w: size, h: size, paletteAssignment: paletteAssignment});
    
    // set up the ppu
    this.ppu = new GFX.PPU();
    this.ppu.pal = pal;
    this.ppu.width = size * 16;
    this.ppu.height = size * 16;
    this.ppu.back = true;

    // layer 1
    this.ppu.layers[0].format = GFX.TileFormat.snes4bppTile;
    this.ppu.layers[0].cols = size * 2;
    this.ppu.layers[0].rows = size * 2;
    this.ppu.layers[0].z[0] = GFX.Z.snes1L;
    this.ppu.layers[0].z[1] = GFX.Z.snes1H;
    this.ppu.layers[0].gfx = gfx;
    this.ppu.layers[0].tiles = this.worldLayer.tiles;
    this.ppu.layers[0].main = this.showLayer1; // layer 1 always in main screen

    this.scrollDiv.style.width = (this.ppu.width * this.zoom).toString() + "px";
    this.scrollDiv.style.height = (this.ppu.height * this.zoom).toString() + "px";
    this.mapCanvas.width = this.ppu.width;
    this.mapCanvas.height = this.ppu.height;
    
    this.invalidateMap();
    this.selectedTrigger = null;
    this.loadTriggers();
    this.scroll();

    this.tileset.loadMap(m);
}

FF4Map.prototype.invalidateMap = function(rect) {
    if (!rect) {
        // invalidate all sectors
        var sectorCount = (this.ppu.width >> 8) * (this.ppu.height >> 8);
        this.mapSectors = new Array(sectorCount);
        this.dirtyRect = null;
    } else if (this.dirtyRect) {
        // combine dirty areas
        var left = Math.min(this.dirtyRect.l, rect.l);
        var top = Math.min(this.dirtyRect.t, rect.t);
        var right = Math.max(this.dirtyRect.r, rect.r);
        var bottom = Math.max(this.dirtyRect.b, rect.b);
        this.dirtyRect = new Rect(left, right, top, bottom);
    } else {
        // set a new dirty area
        this.dirtyRect = rect;
    }
}

FF4Map.prototype.drawMap = function() {
        
    // update the map canvas
    var mapContext = this.mapCanvas.getContext('2d');
    var imageData;

    // draw all visible sectors
    for (var s = 0; s < this.mapSectors.length; s++) {
        // continue if this sector is already drawn
        if (this.mapSectors[s]) continue;
        
        // continue if this sector is not visible
        var col = s % (this.ppu.width >> 8);
        var row = (s / (this.ppu.width >> 8)) | 0;
        var l = col << 8;
        var r = l + 256;
        var t = row << 8;
        var b = t + 256;
        var sectorRect = new Rect(l, r, t, b);
        if (this.mapRect.intersect(sectorRect.scale(this.zoom)).isEmpty()) continue;
        
        // draw the sector (256 x 256 pixels)
        imageData = mapContext.createImageData(256, 256);
        this.ppu.renderPPU(imageData.data, sectorRect.l, sectorRect.t, 256, 256);
        mapContext.putImageData(imageData, sectorRect.l, sectorRect.t);
        
        // validate the sector
        this.mapSectors[s] = true;
    }
    
    // redraw dirty portions of the map
    if (this.dirtyRect) {
    
        var rect = this.dirtyRect;
        this.dirtyRect = null;

        // render the image on the map canvas
        imageData = mapContext.createImageData(rect.w, rect.h);
        this.ppu.renderPPU(imageData.data, rect.l, rect.t, rect.w, rect.h);
        mapContext.putImageData(imageData, rect.l, rect.t);
    }

    var ctx = this.canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.webkitImageSmoothingEnabled = false;
    var scaledRect = this.mapRect.scale(1 / this.zoom);
    ctx.drawImage(this.mapCanvas, scaledRect.l, scaledRect.t, scaledRect.w, scaledRect.h, 0, 0, this.mapRect.w, this.mapRect.h);
    
    this.drawTriggers();
    this.drawCursor();
}

FF4Map.prototype.reloadTriggers = function() {
    this.loadTriggers();
    this.drawMap();
}

FF4Map.prototype.loadTriggers = function() {

    var i;
    this.triggers = [];

    // load triggers
    var triggers = this.rom.mapTriggers.item(this.m);
    if (this.isWorld) triggers = this.rom.worldTriggers.item(this.m - 0xFB);
    this.observer.startObserving(triggers, this.reloadTriggers);
    for (i = 0; i < triggers.array.length; i++) {
        var trigger = triggers.item(i);
        if (trigger.map.value === 0xFE) {
            trigger.key = "treasureProperties";
            trigger.name = "Treasure Properties";
            if (this.m >= 256 && trigger.battle.offset !== 0x01E0) {
                trigger.battle.value += 32;
                trigger.battle.offset = 0x01E0;
            }
        } else if (trigger.map.value === 0xFF) {
            trigger.key = "eventTriggers";
            trigger.name = "Event Trigger";
        } else {
            trigger.key = "entranceTriggers";
            trigger.name = "Entrance Trigger";
            if (this.m >= 252 && trigger.map.offset !== 256) {
                trigger.map.value += 256;
                trigger.map.offset = 256;
            }
        }
        this.triggers.push(trigger);
    }

    // load npcs
    if (this.isWorld) return;
    var npcIndex = this.mapProperties.npc.value;
    if (npcIndex === 0 && this.m !== 0) return;
    var offset = 0;
    if (this.mapProperties.npcMSB.value || this.m >= 256) {
        npcIndex += 256;
        offset = 256;
    }
    var npcProperties = this.rom.npcProperties.item(npcIndex);
    this.observer.startObserving(npcProperties, this.reloadTriggers);
    
    for (i = 0; i < npcProperties.array.length; i++) {
        var npc = npcProperties.item(i);
        if (npc.switch.offset !== offset) {
            npc.switch.value += offset;
            npc.switch.offset = offset;
        }
        this.triggers.push(npc);
    }
}

FF4Map.prototype.insertTrigger = function(type) {
    
    this.closeMenu();
    
    var triggers = this.rom.mapTriggers.item(this.m);
    if (this.isWorld) triggers = this.rom.worldTriggers.item(this.m - 0xFB);

    var trigger = triggers.blankAssembly();

    this.rom.beginAction();
    trigger.x.setValue(this.clickedCol);
    trigger.y.setValue(this.clickedRow);
    if (type === "treasureProperties") {
        trigger.map.setValue(0xFE);
        
        // treasures have to come first
        var i = 0;
        while (triggers.item(i).map.value === 0xFE) i++;
        triggers.insertAssembly(trigger, i);
//        this.logTreasures();
        this.updateTreasures();
//        this.logTreasures();
        
    } else if (type === "eventTriggers") {
        trigger.map.setValue(0xFF);
        triggers.insertAssembly(trigger);
    } else {
        triggers.insertAssembly(trigger);
    }
    this.rom.endAction();
    
    this.observer.startObserving(trigger, this.reloadTriggers);
    this.selectedTrigger = trigger;
    this.rom.select(trigger);
}

FF4Map.prototype.updateTreasures = function() {
    var t = 0;
    for (var m = 0; m < this.rom.mapProperties.array.length; m++) {
        if (m === 256) t = 0; // reset to zero for underground/moon treasures
        this.rom.mapProperties.item(m).treasure.setValue(t);
        var triggers = this.rom.mapTriggers.item(m);
        triggers.array.forEach(function(trigger) {
            if (trigger.map.value === 0xFE) t++;
        });
    }
}

//FF4Map.prototype.logTreasures = function() {
//    for (var m = 0; m < this.rom.mapProperties.array.length; m++) {
//        if (m === 256) t = 0; // reset to zero for underground/moon treasures
//        var t = this.rom.mapProperties.item(m).treasure.value;
//        var name = this.rom.stringTable["mapProperties"].string[m];
//        var triggers = this.rom.mapTriggers.item(m);
//        triggers.array.forEach(function(trigger) {
//            if (trigger.map.value !== 0xFE) return;
//            console.log(t + ": " + name);
//            t++;
//        });
//    }
//}

FF4Map.prototype.insertNPC = function() {
    this.closeMenu();
    
    // get the npc properties
    if (this.isWorld) return;
    var npcIndex = this.mapProperties.npc.value;
    if (npcIndex === 0 && this.m !== 0) return;
    var npcProperties = this.rom.npcProperties.item(npcIndex);

    var npc = npcProperties.blankAssembly();

    this.rom.beginAction();
    npc.x.setValue(this.clickedCol);
    npc.y.setValue(this.clickedRow);
    npcProperties.insertAssembly(npc);
    this.rom.endAction();
    
    this.observer.startObserving(npc, this.reloadTriggers);
    this.selectedTrigger = npc;
    this.rom.select(npc);
}

FF4Map.prototype.deleteTrigger = function() {
    
    this.closeMenu();
    var trigger = this.selectedTrigger;
    if (!trigger) return;
    var triggers = trigger.parent;
    var index = triggers.array.indexOf(trigger);
    if (index === -1) return;
    
    this.rom.beginAction();
    triggers.removeAssembly(index);
    this.rom.endAction();
    
    this.selectedTrigger = null;
    this.rom.select(null);
}

FF4Map.prototype.drawTriggers = function() {
    
    var zoom = this.zoom;
    var xClient = this.mapRect.l;
    var yClient = this.mapRect.t;
    var ctx = this.canvas.getContext('2d');
    
    // function for drawing trigger rectangles with rounded corners
    function drawTriggerRect(x, y, fill) {
        
        var r = zoom * 2;
        var s = zoom * 16 - 4 + 1;
        x = x * zoom * 16 + 2 - 0.5 - xClient;
        y = y * zoom * 16 + 2 - 0.5 - yClient;
        
        ctx.lineWidth = 1;
        ctx.strokeStyle = "white";
        ctx.fillStyle = fill;
        
        ctx.beginPath();
        ctx.moveTo(x, y + r);
        ctx.arcTo(x, y, x + r, y, r);
        ctx.lineTo(x + s - r, y);
        ctx.arcTo(x + s, y, x + s, y + r, r);
        ctx.lineTo(x + s, y + s - r);
        ctx.arcTo(x + s, y + s, x + s - r, y + s, r);
        ctx.lineTo(x + r, y + s);
        ctx.arcTo(x, y + s, x, y + s - r, r);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
    }
    
    if (!this.showTriggers) return;
    for (var i = 0; i < this.triggers.length; i++) {
        var trigger = this.triggers[i];
        var triggerRect = this.rectForTrigger(trigger);
        if (this.mapRect.intersect(triggerRect).isEmpty()) continue;
        var c = "purple";
        switch (trigger.key) {
            case "eventTriggers":
                c = "rgba(0, 0, 255, 0.5)";
                break;
            case "entranceTriggers":
                c = "rgba(255, 0, 0, 0.5)";
                break;
            case "treasureProperties":
                c = "rgba(255, 255, 0, 0.5)";
                break;
            case "npcProperties":
                c = "rgba(128, 128, 128, 0.5)";
                break;
        }
        drawTriggerRect(trigger.x.value, trigger.y.value, c);
    }
    
    // draw npcs (sort by y-coordinate and sprite priority)
    var npcs = this.triggers.filter(function(trigger) {
        return (trigger.key === "npcProperties");
    });
    npcs = npcs.sort(function(trigger1, trigger2) {
        var y1 = trigger1.y.value;
        var y2 = trigger2.y.value;
        return y1 - y2;
    });
    for (i = 0; i < npcs.length; i++) {
        var npc = npcs[i];
        this.drawNPC(npc);
    }
}

FF4Map.prototype.triggerAt = function(x, y) {
    
    var triggers = this.triggersAt(x, y);
    if (triggers.length === 0) return null;
    return triggers[0];
}

FF4Map.prototype.triggersAt = function (x, y) {
    var left, right, top, bottom, length, vertical;
    var zoom = this.zoom;
    var triggers = [];
    
    for (var i = 0; i < this.triggers.length; i++) {
        var trigger = this.triggers[i];
        left = trigger.x.value * 16 * zoom;
        right = left + 16 * zoom;
        top = trigger.y.value * 16 * zoom;
        bottom = top + 16 * zoom;
        
        if (trigger.vertical) {
            length = trigger.length.value;
            vertical = trigger.vertical.value;
            if (vertical) {
                bottom = top + 16 * zoom * (length);
            } else {
                right = left + 16 * zoom * (length);
            }
        }
        
        if (x >= left && x < right && y >= top && y < bottom)
            triggers.push(trigger);        
    }
    return triggers;
}

FF4Map.prototype.rectForTrigger = function(trigger) {
    var l = trigger.x.value * 16 * this.zoom;
    var r = l + 16 * this.zoom;
    var t = trigger.y.value * 16 * this.zoom;
    var b = t + 16 * this.zoom;
    
    if (trigger.vertical) {
        var length = trigger.length.value;
        var vertical = trigger.vertical.value;
        if (vertical) {
            b = t + 16 * this.zoom * (length + 1);
        } else {
            r = l + 16 * this.zoom * (length + 1);
        }
    }

    return new Rect(l, r, t, b);
}

FF4Map.prototype.drawNPC = function(npc) {
    
    var x = npc.x.value * 16;
    var y = npc.y.value * 16;
    var w = 16;
    var h = 16;

    var index = npc.switch.value;
    var g = this.rom.npcPointers.item(index).graphics.value;
    var direction = npc.direction.value;
    var p = npc.palette.value;

    // decode palette
    var pal = new Uint32Array(0x80);
    var p1 = this.mapProperties.npcPalette1.value * 2;
    var p2 = this.mapProperties.npcPalette2.value * 2;
    pal.set(this.rom.mapSpritePalettes.item(0).data, 0x00);
    pal.set(this.rom.mapSpritePalettes.item(1).data, 0x10);
    pal.set(this.rom.mapSpritePalettes.item(2).data, 0x20);
    pal.set(this.rom.mapSpritePalettes.item(3).data, 0x30);
    pal.set(this.rom.npcPalettes.item(p1).data, 0x40);
    pal.set(this.rom.npcPalettes.item(p1 + 1).data, 0x50);
    pal.set(this.rom.npcPalettes.item(p2).data, 0x60);
    pal.set(this.rom.npcPalettes.item(p2 + 1).data, 0x70);
    if (g < 14) {
        // character palette
        var characterPalettes = [0, 0, 1, 2, 2, 2, 0, 1, 1, 3, 0, 1, 0, 0, 0, 0, 0, 0];
        p = characterPalettes[g] << 9;
    } else {
        // npc palette
        p += 4;
        p <<= 9;
    }

    // get a pointer to the sprite graphics
    var gfxOffset = 0;
    var tileCount = 0;
    if (g < 0x11) {
        tileCount = 8;
        gfxOffset = g * 0x60 * 8;
    } else if (g < 0x30) {
        tileCount = 4;
        gfxOffset = (g - 0x11) * 0x60 * 4 + 0x3300;
    } else if (g < 0x46) {
        tileCount = 2;
        gfxOffset = (g - 0x30) * 0x60 * 2 + 0x6180;
    } else {
        tileCount = 1;
        gfxOffset = (g - 0x46) * 0x60 * 1 + 0x7200;
    }
    
    var tileData = [0 | p, 1 | p, 2 | p, 3 | p];
    if (direction === 0 && tileCount > 1) {
        // up
        gfxOffset += 0x60;
    } else if (direction === 1 && tileCount > 2) {
        // right
        gfxOffset += 0xC0;
        p |= 0x4000;
        tileData = [1 | p, 0 | p, 3 | p, 2 | p];
    } else if (direction === 2) {
        // down
        gfxOffset += 0;
    } else if (direction === 3 && tileCount > 2) {
        // left
        gfxOffset += 0xC0;
    }

    // decode graphics
    var gfx = new Uint8Array(0x0100);
    gfxOffset = gfxOffset / 0x18 * 0x40
    var rawGraphics = this.rom.mapSpriteGraphics.data.subarray(gfxOffset, gfxOffset + 0x100);
    gfx.set(rawGraphics);

    var npcRect = new Rect(x, x + w, y, y + h);
    npcRect = npcRect.scale(this.zoom);
    if (this.mapRect.intersect(npcRect).isEmpty()) return;

    // set up the ppu
    var ppu = new GFX.PPU();
    ppu.pal = pal;
    ppu.width = w;
    ppu.height = h;

    // layer 1
    ppu.layers[0].format = GFX.TileFormat.snesSpriteTile;
    ppu.layers[0].cols = w >> 3;
    ppu.layers[0].rows = h >> 3;
    ppu.layers[0].z[0] = GFX.Z.snesS0;
    ppu.layers[0].z[1] = GFX.Z.snesS1;
    ppu.layers[0].z[2] = GFX.Z.snesS2;
    ppu.layers[0].z[3] = GFX.Z.snesS3;
    ppu.layers[0].gfx = gfx;
    ppu.layers[0].tiles = tileData;
    ppu.layers[0].main = true;

    // draw the npc
    this.npcCanvas.width = w;
    this.npcCanvas.height = h;
    var npcContext = this.npcCanvas.getContext('2d');
    var imageData = npcContext.createImageData(w, h);
    ppu.renderPPU(imageData.data);
    npcContext.putImageData(imageData, 0, 0);

    var ctx = this.canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.webkitImageSmoothingEnabled = false;
    npcRect = npcRect.offset(-this.mapRect.l, -this.mapRect.t);
    ctx.drawImage(this.npcCanvas, 0, 0, w, h, npcRect.l, npcRect.t, npcRect.w, npcRect.h);
}

// FF4MapTileset
function FF4MapTileset(rom, map) {

    this.rom = rom;
    this.map = map;
    this.canvas = document.getElementById("tileset");
    this.cursorCanvas = document.getElementById("tileset-cursor");

    this.layer = [new FF4MapLayer(rom, FF4MapLayer.Type.layer1),
                  new FF4MapLayer(rom, FF4MapLayer.Type.layer2)];
    this.worldLayer = new FF4MapLayer(rom, FF4MapLayer.Type.world);

    this.selection = new Uint8Array([0x73, 0, 0, 1, 1, 0]);
    this.clickedCol = null;
    this.clickedRow = null;
    
    this.ppu = new GFX.PPU();

    var tileset = this;
    this.canvas.onmousedown = function(e) { tileset.mouseDown(e) };
    this.canvas.onmouseup = function(e) { tileset.mouseUp(e) };
    this.canvas.onmousemove = function(e) { tileset.mouseMove(e) };
    this.canvas.onmouseout = function(e) { tileset.mouseOut(e) };
    this.canvas.oncontextmenu = function() { return false; };
    var tilesetButtons = document.getElementsByClassName("toolbox-button")
    for (var i = 0; i < tilesetButtons.length; i++) {
        var button = tilesetButtons[i];
        button.onclick = function() { tileset.selectLayer(this.value); };
//        button.addEventListener("click", function() { tileset.selectLayer(this.value); });
    }
}

FF4MapTileset.prototype.mouseDown = function(e) {
    var x = e.offsetX;
    var y = e.offsetY;
    this.clickedCol = x >> 4;
    this.clickedRow = y >> 4;
    this.mouseMove(e);
}

FF4MapTileset.prototype.mouseUp = function(e) {
    this.clickedCol = null;
    this.clickedRow = null;
}

FF4MapTileset.prototype.mouseOut = function(e) {
    this.mouseUp(e);
}

FF4MapTileset.prototype.mouseMove = function(e) {

    // return unless dragging (except if trigger layer selected)
    if (!isNumber(this.clickedCol) || !isNumber(this.clickedRow) || this.map.l === 3) return;

    var col = Math.min(e.offsetX >> 4, 15);
    var row = Math.min(e.offsetY >> 4, 7);
    var cols = Math.abs(col - this.clickedCol) + 1;
    var rows = Math.abs(row - this.clickedRow) + 1;
    col = Math.min(col, this.clickedCol);
    row = Math.min(row, this.clickedRow);

    // create the tile selection
    this.selection = new Uint8Array(5 + cols * rows);
    this.selection.set([0x73, col, row, cols, rows]);
    for (var i = 0; i < cols; i++) {
        for (var j = 0; j < rows; j++) {
            this.selection[5 + i + j * cols] = col + i + (row + j) * 16;
        }
    }
    
    // redraw the cursor and notify the map
    this.drawCursor();
    this.map.selection = new Uint8Array(this.selection);
    if (cols === 1 && rows === 1) this.map.selectTileProperties(this.selection[5]);
}

FF4MapTileset.prototype.selectLayer = function(l) {
    
    // update layer buttons
    var layerButtons = document.getElementsByClassName("toolbox-button");
    for (var i = 0; i < layerButtons.length; i++) {
        // deselect all layer buttons
        layerButtons[i].classList.remove("selected")
    }
    // select the clicked layer
    layerButtons[l].classList.add("selected")

    // set the selected layer
    this.map.selectLayer(l);

    // turn on the selected layer
    this.ppu.layers[0].main = false;
    this.ppu.layers[1].main = false;
    this.ppu.layers[2].main = false;
    
    // render the image on the canvas
    this.canvas.width = 256;
    this.canvas.height = 128;
    this.canvas.width = 256;
    this.cursorCanvas.height = 128;
    var ctx = this.canvas.getContext('2d');
    if (this.map.l === 3) {
        this.canvas.style.display = "none";
        this.cursorCanvas.style.display = "none";
        this.canvas.parentElement.style.height = "0px";
    } else {
        this.canvas.style.display = "block";
        this.cursorCanvas.style.display = "block";
        this.canvas.parentElement.style.height = "128px";
        var imageData = ctx.createImageData(this.ppu.width, this.ppu.height);
        this.ppu.layers[this.map.l].main = true;
        this.ppu.renderPPU(imageData.data);
        ctx.putImageData(imageData, 0, 0);
    }
    
    this.drawCursor();
    this.map.selection = new Uint8Array(this.selection);
}

FF4MapTileset.prototype.drawCursor = function() {
    
    // clear the cursor canvas
    var ctx = this.cursorCanvas.getContext('2d');
    ctx.clearRect(0, 0, this.ppu.width, this.ppu.height);

    // return if trigger layer is selected
    if (this.map.l === 3) return;
    if (!this.selection) return;
    
    // get the cursor geometry
    var x = this.selection[1] << 4;
    var y = this.selection[2] << 4;
    var w = this.selection[3] << 4;
    var h = this.selection[4] << 4;

    // draw the cursor
    if (w <= 0 || h <= 0) return;
    
    // convert the selection to screen coordinates
    var colors = ["green", "blue", "red", "white"];
    ctx.lineWidth = 1;
    ctx.strokeStyle = "black";
    x += 0.5; y += 0.5; w--; h--;
    ctx.strokeRect(x, y, w, h);
    x++; y++; w -= 2; h -= 2;
    ctx.strokeStyle = colors[this.map.l];
    ctx.strokeRect(x, y, w, h);
    x++; y++; w -= 2; h -= 2;
    ctx.strokeStyle = "white";
    ctx.strokeRect(x, y, w, h);
    x++; y++; w -= 2; h -= 2;
    ctx.strokeStyle = "black";
    ctx.strokeRect(x, y, w, h);
}

FF4MapTileset.prototype.loadMap = function(m) {

    // create a sequential tile layout
    var layout = new Uint8Array(128);
    for (var i = 0; i < 128; i++) {
        layout[i] = i;
    }
    
    // set up the ppu
    this.ppu = new GFX.PPU();
    this.ppu.pal = this.map.ppu.pal;
    this.ppu.height = 128;
    this.ppu.width = 256;
    this.ppu.back = true;

    if (this.map.isWorld) {
        this.worldLayer.loadLayout({layout: layout, tileset: this.map.worldLayer.tileset, w: 16, h: 8, paletteAssignment: this.map.worldLayer.paletteAssignment})
        
        // layer 1
        this.ppu.layers[0].format = GFX.TileFormat.snes4bppTile;
        this.ppu.layers[0].rows = 16;
        this.ppu.layers[0].cols = 32;
        this.ppu.layers[0].z[0] = GFX.Z.snes1L;
        this.ppu.layers[0].z[1] = GFX.Z.snes1H;
        this.ppu.layers[0].gfx = this.map.ppu.layers[0].gfx;
        this.ppu.layers[0].tiles = this.worldLayer.tiles;
        
    } else {
        this.layer[0].loadLayout({layout: layout, tileset: this.map.layer[0].tileset, w: 16, h: 8});
        this.layer[1].loadLayout({layout: layout, tileset: this.map.layer[1].tileset, w: 16, h: 8});
        
        // layer 1
        this.ppu.layers[0].format = GFX.TileFormat.snes4bppTile;
        this.ppu.layers[0].rows = 16;
        this.ppu.layers[0].cols = 32;
        this.ppu.layers[0].z[0] = GFX.Z.snes1L;
        this.ppu.layers[0].z[1] = GFX.Z.snes1H;
        this.ppu.layers[0].gfx = this.map.ppu.layers[0].gfx;
        this.ppu.layers[0].tiles = this.layer[0].tiles;

        // layer 2
        this.ppu.layers[1].format = GFX.TileFormat.snes4bppTile;
        this.ppu.layers[1].rows = 16;
        this.ppu.layers[1].cols = 32;
        this.ppu.layers[1].z[0] = GFX.Z.snes2L;
        this.ppu.layers[1].z[1] = GFX.Z.snes2H;
        this.ppu.layers[1].gfx = this.map.ppu.layers[1].gfx;
        this.ppu.layers[1].tiles = this.layer[1].tiles;
    }
    
    this.selectLayer(this.map.l);
}

// FF4MapLayer
function FF4MapLayer(rom, type) {
    this.rom = rom;
    this.type = type;
    this.tileset = null;
}

FF4MapLayer.Type = {
    layer1: "layer1",
    layer2: "layer2",
    world: "world"
}

FF4MapLayer.prototype.loadLayout = function(definition) {

    this.layout = definition.layout;
    this.tileset = definition.tileset;
    this.w = definition.w;
    this.h = definition.h;
    this.paletteAssignment = definition.paletteAssignment; // world map only

    // update tiles for the entire map
    this.tiles = new Uint16Array(this.w * this.h * 4);
    this.decodeLayout();
}

FF4MapLayer.prototype.setLayout = function(layout) {

    // layout 0 is always blank
    if (!this.layout.data && this.type !== "world") return;

    var x = layout[1];
    var y = layout[2];
    var w = layout[3];
    var h = layout[4];
    
    x = x % this.w;
    y = y % this.h;
    var clippedW = Math.min(w, this.w - x);
    var clippedH = Math.min(h, this.h - y);
    
    for (var row = 0; row < clippedH; row++) {
        var ls = 5 + row * w;
        var ld = x + (y + row) * this.w;
        if (this.type === "world") {
            if (y + row > 256) break;
            this.layout[y + row].setData(layout.slice(ls, ls + clippedW), x);
        } else {
            if (ld + clippedW > this.layout.data.length) break;
            this.layout.setData(layout.slice(ls, ls + clippedW), ld);
        }
    }
    this.decodeLayout(x, y, clippedW, clippedH);
}

FF4MapLayer.prototype.getLayout = function(col, row, cols, rows) {
    
    // limit the selection rectangle to the size of the layer
    var clippedCol = col % this.w;
    var clippedRow = row % this.h;
    cols = Math.min(cols, this.w - clippedCol);
    rows = Math.min(rows, this.h - clippedRow);

    // create the tile selection
    var layout = this.layout.data || this.layout;
    var selection = new Uint8Array(5 + cols * rows);
    selection.set([0x73, col, row, cols, rows]);
    for (var y = 0; y < rows; y++) {
        for (var x = 0; x < cols; x++) {
            if (this.type === "world") {
                selection[5 + x + y * cols] = layout[y + clippedRow].data[x + clippedCol];
            } else {
                selection[5 + x + y * cols] = layout[x + clippedCol + (y + clippedRow) * this.w];
            }
        }
    }
    return selection;
}

FF4MapLayer.prototype.decodeLayout = function(x, y, w, h) {
    
    x = x || 0;
    y = y || 0;
    x %= this.w;
    y %= this.h;
    w = w || this.w;
    h = h || this.h;
    w = Math.min(w, this.w - x);
    h = Math.min(h, this.h - y);
    
    switch (this.type) {
        case FF4MapLayer.Type.layer1:
        case FF4MapLayer.Type.layer2:
            this.decodeMapLayout(x, y, w, h);
            break;
        case FF4MapLayer.Type.world:
            this.decodeWorldLayout(x, y, w, h);
            break;
        default:
            break;
    }
}

FF4MapLayer.prototype.decodeMapLayout = function(x, y, w, h) {
    
    var layout = this.layout.data || this.layout;
    var l = x + y * this.w;
    var t = x * 2 + y * this.w * 4;
    var row, col, tile, i;

    for (row = 0; row < h; row++) {
        for (col = 0; col < w; col++) {
            tile = layout[l + col] * 2;   
            i = t + col * 2;
            if (i > this.tiles.length) return;
            this.tiles[i + 0] = this.tileset[tile + 0x0000] | (this.tileset[tile + 0x0001] << 8);
            this.tiles[i + 1] = this.tileset[tile + 0x0100] | (this.tileset[tile + 0x0101] << 8);
            i += this.w * 2;
            this.tiles[i + 0] = this.tileset[tile + 0x0200] | (this.tileset[tile + 0x0201] << 8);
            this.tiles[i + 1] = this.tileset[tile + 0x0300] | (this.tileset[tile + 0x0301] << 8);
        }
        t += this.w * 4;
        l += this.w;
    }
}

FF4MapLayer.prototype.decodeWorldLayout = function(x, y, w, h) {

    var tileset = new Uint16Array(512);
    for (var i = 0; i < 512; i++) {
        var t = this.tileset[i];
        var p = this.paletteAssignment[t] << 6;
        tileset[i] = t | p;
    }
    
    var layout = this.layout;
    if (layout[0] instanceof ROMAssembly) {
        layout = new Uint8Array(0x10000);
        for (var i = 0; i < this.h; i++) {
            layout.set(this.layout[i].data, i * this.w);
        }
    }
    var l = x + y * this.w;
    var t = x * 2 + y * this.w * 4;
    var row, col, tile;

    for (row = 0; row < h; row++) {
        for (col = 0; col < w; col++) {
            tile = layout[l + col];   
            if (tile > 0x7F) tile = 0;
            i = t + col * 2;
            if (i > this.tiles.length) return;
            this.tiles[i + 0] = tileset[tile + 0x0000];
            this.tiles[i + 1] = tileset[tile + 0x0080];
            i += this.w * 2;
            this.tiles[i + 0] = tileset[tile + 0x0100];
            this.tiles[i + 1] = tileset[tile + 0x0180];
        }
        t += this.w * 4;
        l += this.w;
    }
}

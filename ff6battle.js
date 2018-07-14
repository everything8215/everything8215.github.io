//
// ff6battle.js
// created 6/24/2018
//

function FF6Battle(rom) {
    this.rom = rom;
    this.name = "FF6Battle";

    this.b = null; // battle index
    this.bg = 0; // battle background index
    this.battleProperties = null;
    this.battlePropertiesAux = null;
    this.ppu = null;
    this.canvas = document.createElement('canvas');
    this.battleCanvas = document.createElement('canvas');
    this.battleCanvas.width = 256;
    this.battleCanvas.height = 256;
    this.monsterCanvas = document.createElement('canvas');
    this.div = document.createElement('div');
    this.div.id = 'map-edit';
    this.div.appendChild(this.canvas);
    
    this.battleRect = new Rect(8, 248, rom.isSFC ? 5 : 32, 152);
    this.zoom = 2.5;

    this.selectedMonster = null;
    
    this.observer = new ROMObserver(rom, this, {sub: true, link: true, array: true});

    var self = this;
    this.canvas.onmousedown = function(e) { self.mouseDown(e) };
    this.canvas.onmousemove = function(e) { self.mouseMove(e) };
    this.canvas.onmouseup = function(e) { self.mouseUp(e) };
//    this.canvas.onmouseenter = function(e) { self.mouseEnter(e) };
    this.canvas.onmouseleave = function(e) { self.mouseLeave(e) };
    this.monsterPoint = null;
    this.clickedPoint = null;
}

FF6Battle.prototype.mouseDown = function(e) {
    var x = Math.floor(e.offsetX / this.zoom) + this.battleRect.l;
    var y = Math.floor(e.offsetY / this.zoom) + this.battleRect.t;
    this.selectedMonster = this.monsterAtPoint(x, y);

    if (this.selectedMonster) {
        this.clickedPoint = {x: x, y: y};
        var monsterX = this.battleProperties["monster" + this.selectedMonster + "X"].value;
        var monsterY = this.battleProperties["monster" + this.selectedMonster + "Y"].value;
        this.monsterPoint = { x: monsterX, y: monsterY };
        
        var m = this.monsterInSlot(this.selectedMonster);
        this.rom.select(this.rom.monsterProperties.item(m));
    } else {
//        this.bg++;
//        if (this.bg >= 56) this.bg = 0;
        this.rom.select(this.battleProperties);
    }
    
    this.drawBattle();
}

FF6Battle.prototype.mouseMove = function(e) {
    if (!this.selectedMonster || !this.clickedPoint) return;
    
    var x = Math.floor(e.offsetX / this.zoom) + this.battleRect.l;
    var y = Math.floor(e.offsetY / this.zoom) + this.battleRect.t;
    
    var dx = x - this.clickedPoint.x;
    var dy = y - this.clickedPoint.y;

    var m = this.monsterInSlot(this.selectedMonster);
    var monsterX = this.battleProperties["monster" + this.selectedMonster + "X"].value;
    var monsterY = this.battleProperties["monster" + this.selectedMonster + "Y"].value;
    var newX = (this.monsterPoint.x + dx) & ~7;
    var newY = (this.monsterPoint.y + dy) & ~7;
    newX = Math.min(120, Math.max(0, newX));
    newY = Math.min(120, Math.max(0, newY));
    
    if (newX === monsterX && newY === monsterY) return;
    
    this.observer.stopObserving(this.battleProperties);
    this.battleProperties["monster" + this.selectedMonster + "X"].value = newX;
    this.battleProperties["monster" + this.selectedMonster + "Y"].value = newY;
    this.observer.startObserving(this.battleProperties, this.drawBattle);
    this.drawBattle();
}

FF6Battle.prototype.mouseUp = function(e) {
    
    if (!this.selectedMonster || !this.monsterPoint) return;

    // get the new monster's position properties
    var monsterX = this.battleProperties["monster" + this.selectedMonster + "X"];
    var monsterY = this.battleProperties["monster" + this.selectedMonster + "Y"];
    
    var newPoint = { x: monsterX.value, y: monsterY.value };
    var oldPoint = this.monsterPoint;

    this.clickedPoint = null;
    this.monsterPoint = null;

    // return if the monster didn't move
    if (oldPoint.x === newPoint.x && oldPoint.y === newPoint.y) return;

    // temporarily move the monster back to its original position
    monsterX.value = oldPoint.x;
    monsterY.value = oldPoint.y;

    this.observer.stopObserving(this.battleProperties);
    this.rom.beginAction();
    monsterX.setValue(newPoint.x);
    monsterY.setValue(newPoint.y);
    this.rom.endAction();
    this.observer.startObserving(this.battleProperties, this.drawBattle);
}

FF6Battle.prototype.mouseLeave = function(e) {
    this.mouseUp(e);
}

FF6Battle.prototype.selectObject = function(object) {
    document.getElementById("tileset-div").classList.add('hidden');
    document.getElementById("tileset-layers").classList.add('hidden');
    this.loadBattle(object.i);
}

FF6Battle.prototype.loadBattle = function(b) {
    b = Number(b);
    if (isNumber(b) && this.b !== b) {
        // battle index has changed
        this.observer.stopObserving(this.battleProperties);
        this.b = b;
        this.battleProperties = this.rom.battleProperties.item(b);
        this.observer.startObserving(this.battleProperties, this.drawBattle);
    }
    
    this.selectedMonster = null;
    this.drawBattle();
}

FF6Battle.prototype.monsterInSlot = function(slot) {
    var m = this.battleProperties["monster" + slot].value;
    if (this.battleProperties["monster" + slot + "MSB"].value) m += 256;
    if (m === 0x01FF) return null; // slot is empty

    return m;
}

FF6Battle.prototype.monstersSortedByPriority = function() {
    var self = this;
    return [1, 2, 3, 4, 5, 6].sort(function(a, b) {
        var m1 = self.monsterInSlot(a);
        if (m1 === null) return false;
        var m2 = self.monsterInSlot(b);
        if (m2 === null) return true;
        var y1 = self.rectForMonster(a).b + self.rom.monsterProperties.item(m1).verticalOffset.value;
        var y2 = self.rectForMonster(b).b + self.rom.monsterProperties.item(m2).verticalOffset.value;
        return y1 < y2;
    });
}

FF6Battle.prototype.rectForMonster = function(slot) {
    var m = this.monsterInSlot(slot);
    if (m === null) return Rect.emptyRect;

    // load graphics properties
    var x = this.battleProperties["monster" + slot + "X"].value;
    var y = this.battleProperties["monster" + slot + "Y"].value;
    
    // minimum size is 1x1
    var w = 1; var h = 1;
    var map = this.mapForMonster(slot);
    for (var t = 0; t < map.tiles.length; t++) {
        if (!map.tiles[t]) continue;
        w = Math.max(w, (t % map.size) + 1);
        h = Math.max(h, Math.floor(t / map.size) + 1)
    }
    
    return new Rect(x, x + w * 8, y, y + h * 8);
}

FF6Battle.prototype.monsterAtPoint = function(x, y) {
    
    var sorted = this.monstersSortedByPriority();
    for (var i = 0; i < 6; i++) {
        var slot = sorted[i]
        if (this.rectForMonster(slot).containsPoint(x, y)) return slot;
    }
    return null;
}

FF6Battle.prototype.drawBattle = function() {
    this.drawBackground();
    var self = this;
    this.monstersSortedByPriority().reverse().forEach(function(m) {
        self.drawMonster(m);
    });
    
    this.zoom = this.div.clientWidth / this.battleRect.w;
    
    var scaledRect = this.battleRect.scale(this.zoom);
    this.canvas.width = scaledRect.w;
    this.canvas.height = scaledRect.h;
    
    var ctx = this.canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.webkitImageSmoothingEnabled = false;
    ctx.drawImage(this.battleCanvas, this.battleRect.l, this.battleRect.t, this.battleRect.w, this.battleRect.h, 0, 0, scaledRect.w, scaledRect.h);
}

FF6Battle.prototype.mapForMonster = function(slot) {
    var m = this.monsterInSlot(slot);
    if (m === null) return null; // return if slot is empty
    
    if (this.rom.isGBA && m >= 384) m += 36;

    // load graphics properties
    var gfxProperties = this.rom.monsterGraphicsProperties.item(m);

    // load graphics map and set up tile data
    var size, mask, row, map;
    if (gfxProperties.largeMap.value) {
        size = 16; mask = 0x8000;
        if (this.rom.isSFC) {
            map = this.rom.monsterGraphicsMap.large.item(gfxProperties.map.value).data;
        } else {
            var mapBegin = this.rom.mapAddress(gfxProperties.mapPointer.value);
            var mapEnd = mapBegin + 32;
            map = this.rom.data.subarray(mapBegin, mapEnd);
        }
        map = new Uint16Array(map.buffer, map.byteOffset, map.byteLength / 2);
    } else {
        size = 8; mask = 0x80;
        if (this.rom.isSFC) {
            map = this.rom.monsterGraphicsMap.small.item(gfxProperties.map.value).data;
        } else {
            var mapBegin = this.rom.mapAddress(gfxProperties.mapPointer.value);
            var mapEnd = mapBegin + 8;
            map = this.rom.data.subarray(mapBegin, mapEnd);
        }
    }
    
    var tiles = new Uint16Array(size * size);
    
    for (var g = 1, t = 0; t < tiles.length; t++, row <<= 1) {
        if (t % size === 0) {
            row = map[t / size];
            if (this.rom.isSFC && size === 16) row = bytesSwapped16(row);
        }
        if (row & mask) tiles[t] = g++;
    }
    return {size: size, tiles: tiles};
}

FF6Battle.prototype.drawMonster = function(slot) {
    var m = this.monsterInSlot(slot);
    if (m === null) return; // return if slot is empty
    
    if (this.rom.isGBA && m >= 384) m += 36;
    
    // load graphics properties
    var gfxProperties = this.rom.monsterGraphicsProperties.item(m);
    
    // decode the graphics
    var gfx = this.rom.monsterGraphics.item(m);
    if (!gfx.format) {
        if (this.rom.isSFC) {
            gfx.format = gfxProperties.is3bpp.value ? "snes3bpp" : "snes4bpp";
        } else {
            gfx.format = "linear4bpp";
        }
        gfx.disassemble(gfx.parent.data);
    }
//    var tileCount = Math.floor(gfx.data.length / 64);
    var graphics = new Uint8Array(gfx.data.length + 64);
    graphics.set(gfx.data, 64);
    
    var map = this.mapForMonster(slot);
    
    // load palette (use palette 1, palette 0 is for transparent tiles)
    var p = gfxProperties.palette.value;
    var pal = new Uint32Array(16);
    pal.set(this.rom.monsterPalette.item(p).data);
    if (this.rom.isGBA || !gfxProperties.is3bpp.value) pal.set(this.rom.monsterPalette.item(p + 1).data, 8);
    
    // set up the ppu
    var ppu = new GFX.PPU();
    ppu.pal = pal;
    ppu.width = map.size * 8;
    ppu.height = map.size * 8;

    // layer 1
    ppu.layers[0].format = GFX.TileFormat.snesSpriteTile;
    ppu.layers[0].cols = map.size;
    ppu.layers[0].rows = map.size;
    ppu.layers[0].z[0] = GFX.Z.snesS0;
    ppu.layers[0].z[1] = GFX.Z.snesS1;
    ppu.layers[0].z[2] = GFX.Z.snesS2;
    ppu.layers[0].z[3] = GFX.Z.snesS3;
    ppu.layers[0].gfx = graphics;
    ppu.layers[0].tiles = map.tiles;
    ppu.layers[0].main = true;

    // draw the monster
    this.monsterCanvas.width = ppu.width;
    this.monsterCanvas.height = ppu.height;
    var context = this.monsterCanvas.getContext('2d');
    var imageData = context.createImageData(ppu.width, ppu.height);
    ppu.renderPPU(imageData.data);
    context.putImageData(imageData, 0, 0);
    
    // tint the selected monster
    if (this.selectedMonster === slot) {
        // create an offscreen canvas filled with the color
        var tintCanvas = document.createElement('canvas');
        tintCanvas.width = ppu.width;
        tintCanvas.height = ppu.height;
        var ctx = tintCanvas.getContext('2d');
        ctx.fillStyle = 'hsla(210, 100%, 50%, 0.5)';
        ctx.fillRect(0, 0, ppu.width, ppu.height);

        ctx = this.monsterCanvas.getContext('2d');
        ctx.globalCompositeOperation = 'source-atop';
        ctx.drawImage(tintCanvas, 0, 0);
    }
    
    var ctx = this.battleCanvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.webkitImageSmoothingEnabled = false;
    monsterRect = this.rectForMonster(slot);
    ctx.drawImage(this.monsterCanvas, 0, 0, monsterRect.w, monsterRect.h, monsterRect.l, monsterRect.t, monsterRect.w, monsterRect.h);
}

FF6Battle.prototype.tintCanvas = function(canvas, color) {
    // create an offscreen canvas filled with the color
    var tintCanvas = document.createElement('canvas');
    tintCanvas.width = canvas.width;
    tintCanvas.height = canvas.height;
    var ctx = tintCanvas.getContext('2d');
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    ctx = canvas.getContext('2d');
    ctx.globalCompositeOperation = 'source-atop';
    ctx.drawImage(tintCanvas, 0, 0);
}

FF6Battle.prototype.drawBackground = function() {
    
    var properties = this.rom.battleBackgroundProperties.item(this.bg);
    var g1 = properties.graphics1.value;
    var g2 = properties.graphics2.value;
    var g3 = properties.graphics3.value;

    // load graphics
    var gfx = new Uint8Array(0x10000);
    gfx.set(this.loadBattleBackgroundGraphics(g1), this.rom.isSFC ? 0x0000 : 0x4000);
    gfx.set(this.loadBattleBackgroundGraphics(g2), this.rom.isSFC ? 0x2000 : 0x6000);
    gfx.set(this.loadBattleBackgroundGraphics(g3), this.rom.isSFC ? 0xE000 : 0x2000);
    
    var l = properties.layout1.value;
    var layout = this.rom.battleBackgroundLayout.item(l).data;
    
    var p = properties.palette.value;
    var pal = new Uint32Array(0x80);
    pal[0] = 0xFF000000;
    pal.set(this.rom.battleBackgroundPalette.item(p).data, 0x50);
    
    // set up the ppu
    this.ppu = new GFX.PPU();
    this.ppu.pal = pal;
    this.ppu.height = 256;
    this.ppu.width = 256;
    this.ppu.back = true;

    // layer 2
    this.ppu.layers[1].format = this.rom.isSFC ? GFX.TileFormat.snes4bppTile : GFX.TileFormat.gba4bppTile;
    this.ppu.layers[1].cols = 32;
    this.ppu.layers[1].rows = 32;
    this.ppu.layers[1].z[0] = GFX.Z.snes2L;
    this.ppu.layers[1].z[1] = GFX.Z.snes2H;
    this.ppu.layers[1].gfx = gfx;
    this.ppu.layers[1].tiles = new Uint16Array(layout.buffer, layout.byteOffset, Math.floor(layout.byteLength / 2));
    this.ppu.layers[1].main = true;

    var context = this.battleCanvas.getContext('2d');
    imageData = context.createImageData(256, 256);
    this.ppu.renderPPU(imageData.data, 0, 0, 256, 256);
    context.putImageData(imageData, 0, 0);
}

FF6Battle.prototype.loadBattleBackgroundGraphics = function(i) {
    if (i === 0xFF) return new Uint8Array(0); // no graphics

    var bgGraphics = this.rom.battleBackgroundGraphics;
    var pointer = bgGraphics.pointerTable.item(i & 0x7F).pointer;

    if (this.rom.isSFC) {
        // normal battle bg graphics
        if (bgGraphics.range.contains(pointer.value)) return bgGraphics.item(i & 0x7F).data;

        // use map graphics (absolute pointer)
        var begin = this.rom.mapAddress(pointer.value);
        var end = begin + (i & 0x80 ? 0x2000 : 0x1000);
    } else {
        // normal battle bg graphics
        if ((pointer.data[2] & 0x80) === 0) return bgGraphics.item(i & 0x7F).data;

        // use map graphics (absolute pointer)
        pointer.mask = 0x7FFFFF;
        pointer.offset = this.rom.mapGraphics.pointerTable.item(0).pointer.offset;
        pointer.disassemble(pointer.parent.data);
    }
    var begin = this.rom.mapAddress(pointer.value);
    var end = begin + (i & 0x80 ? 0x2000 : 0x1000);
    var decode = this.rom.isSFC ? GFX.decodeSNES4bpp : GFX.decodeLinear4bpp;
    return decode(this.rom.data.subarray(begin, end));
}
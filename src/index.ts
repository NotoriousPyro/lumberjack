
import { ActorDamageCause, ActorDamageSource } from "bdsx/bds/actor";
import { Block } from "bdsx/bds/block";
import { BlockPos, Facing } from "bdsx/bds/blockpos";
import { ItemStack } from "bdsx/bds/inventory";
import { events } from "bdsx/event";
import { BlockDestroyEvent } from "bdsx/event_impl/blockevent";
import { bedrockServer } from 'bdsx/launcher';

const pName = "NotoriousPyro's Lumberjack Plugin";
const logger = (message: string) => console.log('[plugin:'+pName+'] ' + message);

class AdjacentBlock {
    constructor(
        public blockPos: BlockPos,
        public block: Block,
        public facing: Facing,
    ) {
    }
}

class AdjacentBlocks {
    constructor(
        public north: AdjacentBlock,
        public east: AdjacentBlock,
        public west: AdjacentBlock,
        public south: AdjacentBlock,
        public down: AdjacentBlock,
        public up: AdjacentBlock,
    ) {
    }

}

// These will likely be configuration options at a later date, but for now they are hard-coded.
/**
 ** 0: Only axes can lumberjack an entire tree, using non-axes will leave the blocks floating.
 ** 1: Axes and non-axes can lumberjack an entire tree.

    Causes damagePerBlockDestroyed to be ignored (and thus false) because a player could just use their fists for
    the last block of a large tree with behaviourMode = 1, negating any damage to the item.
 *  */ 
const behaviourMode: number = 0;
/** Apply damage to the item per block that was lumberjack'd.
 * 
 * Thus this setting default is ___true___. */ 
const damagePerBlockDestroyed: boolean = true;
/**
 * Must the player be sneaking before trying to lumberjack the tree?
 */
const onlyOnSneak: boolean = false;

class Lumberjack {
    private event: BlockDestroyEvent;
    private carriedItem: ItemStack;

    constructor(
    ) {
    }

    public chop = (event: BlockDestroyEvent) => {
        this.event = event;
        if (onlyOnSneak && this.event.player.isSneaking() === false) {
            return;
        }
        this.carriedItem = this.event.player.getCarriedItem();
        // Weapon used must be an axe
        if (behaviourMode === 0 && this.carriedItem.getName().includes('axe') === false) {
            return;
        }
        // Block destroyed must be a log
        if (this.isLog(this.event.blockSource.getBlock(this.event.blockPos)) === false) {
            return;
        }
        const { north, east, west, south, down, up } = this.getAdjacentBlocks(this.event.blockPos)
        // Check there are no adjacent logs with a dirt base supporting the tree.
        for (const position of [north, east, west, south]) {
            if (this.isLog(position.block) === true) {
                if (this.isBaseMadeOfDirt(position) === true) {
                    return;
                }
            }
        }
        // Check that the broken log was part of a tree placed on dirt.
        if (this.isAir(down.block) === false) {
            if (this.isBaseMadeOfDirt(down) === false) {
                return;
            }
        }
        // Check that the broken log has leaves somewhere above it, otherwise its probably not a tree.
        if (this.isTree(up) === false) {
            return;
        }
        this.recurseDestroyTree(up);
    }

    getAdjacentBlocks = (pos: BlockPos): AdjacentBlocks => {
        const north = this.getAdjacentBlock(pos, Facing.North)
        const east = this.getAdjacentBlock(pos, Facing.East)
        const west = this.getAdjacentBlock(pos, Facing.West)
        const south = this.getAdjacentBlock(pos, Facing.South)
        const down = this.getAdjacentBlock(pos, Facing.Down)
        const up = this.getAdjacentBlock(pos, Facing.Up)
        return new AdjacentBlocks(north, east, west, south, down, up)
    }
    
    getAdjacentBlock = (pos: BlockPos, facing: Facing) => {
        const side = pos.getSide(facing);
        return new AdjacentBlock(side, this.event.blockSource.getBlock(side), facing);
    }

    isLog = (block: Block) => {
        if (block.getDescriptionId().startsWith('tile.log')) {
            return true;
        }
        if (block.getDescriptionId().startsWith('tile.stripped_') && block.getDescriptionId().endsWith('_log')) {
            return true;
        }
        return false;
    }

    isDirt = (block: Block) => {
        return block.getDescriptionId().startsWith('tile.dirt');
    }

    isLeaves = (block: Block) => {
        return block.getDescriptionId().startsWith('tile.leaves');
    }

    isAir = (block: Block) => {
        return block.getDescriptionId().startsWith('tile.air');
    }

    isBaseMadeOfDirt = (block: AdjacentBlock): boolean => {
        if (this.isLog(block.block)) {
            return this.isBaseMadeOfDirt(this.getAdjacentBlock(block.blockPos, Facing.Down));
        }
        if (this.isDirt(block.block)) {
            return true;
        }
        return false;
    }
    
    isTree = (block: AdjacentBlock): boolean => {
        if (this.isLog(block.block)) {
            return this.isTree(this.getAdjacentBlock(block.blockPos, Facing.Up));
        }
        if (this.isLeaves(block.block) || this.isAir(block.block)) {
            return true;
        }
        return false;
    }

    recurseDestroyTree = (block: AdjacentBlock) => {
        let blockDestroyCount = 0;
        const recurseDestroy = (block: AdjacentBlock) => {
            if (this.isLog(block.block)) {
                blockDestroyCount += 1;
                bedrockServer.level.destroyBlock(this.event.blockSource, block.blockPos, true);
                const { north, east, west, south, down, up } = this.getAdjacentBlocks(block.blockPos);
                for (const position of [north, east, west, south, up]) {
                    recurseDestroy(position);
                }
            }
            if (this.isLeaves(block.block) || this.isAir(block.block)) {
                const { north, east, west, south, down, up } = this.getAdjacentBlocks(block.blockPos);
                for (const position of [north, east, west, south]) {
                    if (this.isLog(position.block)) {
                        if (this.isBaseMadeOfDirt(position) === false) {
                            recurseDestroy(position);
                        }
                    }
                }
            }
        }
        const { north, east, west, south, down, up } = this.getAdjacentBlocks(block.blockPos);
        for (const position of [north, east, west, south, block]) {
            recurseDestroy(position);
        }
        switch (behaviourMode) {
            case 0:
                if (damagePerBlockDestroyed === true) {
                    this.carriedItem.hurtAndBreak(blockDestroyCount, this.event.player);;
                }
                return;
            case 1:
            default:
                return;
        }
    }
}

const lumberjack = new Lumberjack()

events.serverOpen.on(()=>{
    logger('Enabled');
});

events.blockDestroy.on((logs) => lumberjack.chop(logs))

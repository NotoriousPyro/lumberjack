
import { Block } from "bdsx/bds/block";
import { BlockPos, Facing } from "bdsx/bds/blockpos";
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

events.serverOpen.on(()=>{
    logger('Enabled');
});

const getAdjacentBlock = (event: BlockDestroyEvent, pos: BlockPos, facing: Facing) => {
    const adjacentBlock = pos.getSide(facing);
    return new AdjacentBlock(adjacentBlock, event.blockSource.getBlock(adjacentBlock), facing);
}

const getAdjacentBlocks = (event: BlockDestroyEvent, pos: BlockPos): AdjacentBlocks => {
    const north = getAdjacentBlock(event, pos, Facing.North)
    const east = getAdjacentBlock(event, pos, Facing.East)
    const west = getAdjacentBlock(event, pos, Facing.West)
    const south = getAdjacentBlock(event, pos, Facing.South)
    const down = getAdjacentBlock(event, pos, Facing.Down)
    const up = getAdjacentBlock(event, pos, Facing.Up)

    return new AdjacentBlocks(north, east, west, south, down, up)
}

const isBaseMadeOfDirt = (event: BlockDestroyEvent, block: AdjacentBlock): boolean => {
    const blockDescriptionId = block.block.getDescriptionId();
    if (blockDescriptionId.startsWith('tile.log')) {
        const adjacentBlock = isBaseMadeOfDirt(event, getAdjacentBlock(event, block.blockPos, Facing.Down))
        return adjacentBlock;
    }
    if (blockDescriptionId.startsWith('tile.dirt')) {
        return true;
    }
    return false;
}

const isTree = (event: BlockDestroyEvent, block: AdjacentBlock): boolean => {
    const blockDescriptionId = block.block.getDescriptionId();
    if (blockDescriptionId.startsWith('tile.log')) {
        const adjacentBlock = isTree(event, getAdjacentBlock(event, block.blockPos, Facing.Up))
        return adjacentBlock;
    }
    if (blockDescriptionId.startsWith('tile.leaves')) {
        return true;
    }
    return false;
}

const recurseDestroyTree = (event: BlockDestroyEvent, block: AdjacentBlock) => {
    let blockDestroyCount = 0;
    const recurseDestroy = (event: BlockDestroyEvent, block: AdjacentBlock) => {
        const blockDescriptionId = block.block.getDescriptionId();
        if (blockDescriptionId.startsWith('tile.log')) {
            blockDestroyCount += 1;
            bedrockServer.level.destroyBlock(event.blockSource, block.blockPos, true);
            const { north, east, west, south, down, up } = getAdjacentBlocks(event, block.blockPos);
            for (const position of [north, east, west, south, up]) {
                recurseDestroy(event, position);
            }
        }
    }
    const { north, east, west, south, down, up } = getAdjacentBlocks(event, block.blockPos);
    for (const position of [north, east, west, south, block]) {
        recurseDestroy(event, position);
    }
    event.player.getCarriedItem().hurtAndBreak(blockDestroyCount, event.player);
}

events.blockDestroy.on((event) => {
    const destroyedBlock = event.blockSource.getBlock(event.blockPos);
    // Block destroyed must be a log
    if (destroyedBlock.getDescriptionId().startsWith('tile.log') === false) {
        return;
    }
    const { north, east, west, south, down, up } = getAdjacentBlocks(event, event.blockPos)
    // No adjacent logs supporting the tree
    for (const position of [north, east, west, south]) {
        if (position.block.getDescriptionId().startsWith('tile.log') === true) {
            return;
        }
    }
    // Check that the broken log was part of a tree placed on dirt
    if (isBaseMadeOfDirt(event, down) === false) {
        return;
    }
    // Check that the broken log has leaves somewhere above it, otherwise its probably not a tree.
    if (isTree(event, up) === false) {
        return;
    }

    recurseDestroyTree(event, up);
})

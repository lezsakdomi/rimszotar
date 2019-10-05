<template>
    <div id="info">
        <div class="before">(i)</div>
        <div class="contents"><slot /></div>
    </div>
</template>
<script>
    export default {
        name: 'info',
    }
</script>
<style scoped>
    #info, .before, .contents {
        display: inline-block;
    }

    .before, .contents {
        height: 1em;
        margin: 0.5em 0.5em 0.5em 0.5em;
    }

    .before {
        width: 1em;
        font-style: italic;
    }

    .contents::before {
        content: " ";
    }

    .contents {
        width: 0;
        transition: all 1s;
        position: absolute;
        overflow: hidden;
        --var-full-width: 250px;
        background: whitesmoke;
    }

    .before:hover + .contents {
        width: var(--var-full-width);
    }
</style>
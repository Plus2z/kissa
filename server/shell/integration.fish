# Liminal Shell Integration for Fish
# Injects OSC 133 semantic markers (A/B/C/D) via fish event handlers and prompt wrapper.

if not set -q __LIMINAL_FISH_INTEGRATED
    set -gx __LIMINAL_FISH_INTEGRATED 1

    function __liminal_preexec --on-event fish_preexec
        printf '\033]133;C\007'
    end

    function __liminal_postexec --on-event fish_postexec
        printf '\033]133;D;%s\007' $status
    end

    functions -c fish_prompt __liminal_orig_fish_prompt
    function fish_prompt
        printf '\033]133;A;%s\007' "$PWD"
        __liminal_orig_fish_prompt
        printf '\033]133;B\007'
    end
end

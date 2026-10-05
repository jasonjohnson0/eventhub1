<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Keep the public social feed client-paginated in batches of 20, while the static third-party embed uses URL pagination because it must remain script-free and host-scroll-safe.
- Feed advertising must use the existing campaign selection RPC and tracking endpoints; impression deduplication is per advertiser per feed load.

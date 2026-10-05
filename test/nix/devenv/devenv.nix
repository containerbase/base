{ pkgs, ... }:

{
  env.GREET = "containerbase";

  packages = [ pkgs.hello ];
}

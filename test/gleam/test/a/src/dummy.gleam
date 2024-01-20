import gleam/io

pub type Foo {
  Foo(Int)
}

pub fn main() {
  io.debug(#("hello", Foo(1)))
}
